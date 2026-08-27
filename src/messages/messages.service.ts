import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateMessageDto } from './dto/create-message.dto';

const CHANNEL_WITH_MEMBERS = {
  members: true,
} satisfies Prisma.ChannelInclude;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  // Channels aren't org-wide by default — only channels the user has been
  // added to (see createChannel), matching the mock's distinct channel list
  // rather than exposing every channel in the org to everyone.
  async findChannels(userId: number) {
    const channels = await this.prisma.channel.findMany({
      where: { members: { some: { userId } } },
      include: CHANNEL_WITH_MEMBERS,
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      channels.map((channel) => this.toChannelSummary(channel, userId)),
    );
  }

  async createChannel(userId: number, input: CreateChannelDto) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);

    const memberIds = new Set(input.memberIds ?? []);
    memberIds.add(userId); // the creator is always a member

    for (const id of memberIds) {
      if (id !== userId) {
        await this.organizationsService.assertMembership(organization.id, id);
      }
    }

    const channel = await this.prisma.channel.create({
      data: {
        organizationId: organization.id,
        name: input.name,
        members: {
          create: Array.from(memberIds).map((id) => ({
            userId: id,
            lastReadAt: id === userId ? new Date() : undefined,
          })),
        },
      },
      include: CHANNEL_WITH_MEMBERS,
    });

    return this.toChannelSummary(channel, userId);
  }

  async findMessages(userId: number, channelId: number) {
    const membership = await this.assertChannelMembership(userId, channelId);

    const messages = await this.prisma.message.findMany({
      where: { channelId },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
    });

    // Opening a channel marks it read, same as most chat UIs — no separate
    // "mark read" endpoint needed.
    await this.prisma.channelMember.update({
      where: { id: membership.id },
      data: { lastReadAt: new Date() },
    });

    return messages.map((message) => ({
      ...message,
      author: UsersService.toPublic(message.author),
    }));
  }

  async createMessage(
    userId: number,
    channelId: number,
    input: CreateMessageDto,
  ) {
    const membership = await this.assertChannelMembership(userId, channelId);

    const message = await this.prisma.message.create({
      data: { channelId, authorId: userId, text: input.text },
      include: { author: true },
    });

    // Posting implies you've seen everything up to now — without this, a
    // sender's own message would immediately count as "unread" for them.
    await this.prisma.channelMember.update({
      where: { id: membership.id },
      data: { lastReadAt: message.createdAt },
    });

    return { ...message, author: UsersService.toPublic(message.author) };
  }

  private async assertChannelMembership(userId: number, channelId: number) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const membership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    return membership;
  }

  private async toChannelSummary(
    channel: Prisma.ChannelGetPayload<{ include: typeof CHANNEL_WITH_MEMBERS }>,
    userId: number,
  ) {
    const membership = channel.members.find(
      (member) => member.userId === userId,
    );

    const unread = await this.prisma.message.count({
      where: {
        channelId: channel.id,
        createdAt: membership?.lastReadAt
          ? { gt: membership.lastReadAt }
          : undefined,
      },
    });

    return {
      id: channel.id,
      name: channel.name,
      createdAt: channel.createdAt,
      memberCount: channel.members.length,
      unread,
    };
  }
}
