import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

export interface NotifyInput {
  recipientId: number;
  actorId?: number;
  verb: string;
  targetLabel: string;
  category: NotificationCategory;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Called from other services as a side effect of the action itself —
  // never exposed as a public endpoint. Callers are expected to skip
  // notifying a user about their own action (e.g. self-assignment).
  notify(input: NotifyInput) {
    return this.prisma.notification.create({ data: input });
  }

  async findAll(userId: number) {
    const notifications = await this.prisma.notification.findMany({
      where: { recipientId: userId },
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
    });
    return notifications.map((notification) => ({
      ...notification,
      actor: notification.actor
        ? UsersService.toPublic(notification.actor)
        : null,
    }));
  }

  async markRead(userId: number, id: number) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.recipientId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this notification',
      );
    }

    return this.prisma.notification.update({
      where: { id },
      data: { unread: false },
    });
  }

  async markAllRead(userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: userId, unread: true },
      data: { unread: false },
    });
    return { updated: result.count };
  }
}
