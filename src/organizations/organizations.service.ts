import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { slugify } from '../common/utils/slugify';
import { CreateInvitationsDto } from './dto/create-invitations.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const ADMIN_ROLES: OrgRole[] = [OrgRole.OWNER, OrgRole.ADMIN];
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: number, input: CreateOrganizationDto) {
    const slug = await this.generateUniqueSlug(input.name);

    return this.prisma.organization.create({
      data: {
        name: input.name,
        slug,
        projectPrefix: input.projectPrefix ?? 'DEV',
        timezone: input.timezone ?? 'UTC',
        members: {
          create: { userId: ownerId, role: OrgRole.OWNER },
        },
      },
    });
  }

  // Onboarding creates exactly one organization per user today (no
  // org-switcher in the UI yet), so "current organization" is just the
  // first membership found. Revisit if/when multi-org support lands.
  async getCurrentForUser(userId: number) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { organization: true },
    });
    if (!membership) {
      throw new NotFoundException('No organization found for this user');
    }
    return membership.organization;
  }

  async updateCurrentForUser(userId: number, input: UpdateOrganizationDto) {
    const organization = await this.getCurrentForUser(userId);
    await this.assertAdmin(organization.id, userId);

    return this.prisma.organization.update({
      where: { id: organization.id },
      data: input,
    });
  }

  async listMembers(userId: number) {
    const organization = await this.getCurrentForUser(userId);
    await this.assertMembership(organization.id, userId);

    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: organization.id },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((member) => ({
      ...member,
      user: UsersService.toPublic(member.user),
    }));
  }

  async updateMemberRole(
    actingUserId: number,
    targetUserId: number,
    input: UpdateMemberRoleDto,
  ) {
    const organization = await this.getCurrentForUser(actingUserId);
    await this.assertAdmin(organization.id, actingUserId);

    const target = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: targetUserId,
        },
      },
    });
    if (!target) {
      throw new NotFoundException('Member not found');
    }

    if (target.role === OrgRole.OWNER && input.role !== OrgRole.OWNER) {
      const ownerCount = await this.prisma.organizationMember.count({
        where: { organizationId: organization.id, role: OrgRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException(
          'An organization must have at least one owner',
        );
      }
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: target.id },
      data: { role: input.role },
      include: { user: true },
    });
    return { ...updated, user: UsersService.toPublic(updated.user) };
  }

  async createInvitations(userId: number, input: CreateInvitationsDto) {
    const organization = await this.getCurrentForUser(userId);
    await this.assertAdmin(organization.id, userId);

    const invitations = await Promise.all(
      input.invites.map((invite) =>
        this.prisma.invitation.create({
          data: {
            organizationId: organization.id,
            email: invite.email,
            role: invite.role ?? OrgRole.MEMBER,
            token: randomBytes(24).toString('hex'),
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          },
        }),
      ),
    );
    return invitations;
  }

  async listInvitations(userId: number) {
    const organization = await this.getCurrentForUser(userId);
    await this.assertAdmin(organization.id, userId);

    return this.prisma.invitation.findMany({
      where: { organizationId: organization.id, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptInvitation(userId: number, token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.acceptedAt) {
      throw new ConflictException('This invitation has already been accepted');
    }
    if (invitation.expiresAt < new Date()) {
      throw new ForbiddenException('This invitation has expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'You are already a member of this organization',
      );
    }

    const [membership] = await this.prisma.$transaction([
      this.prisma.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
        },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
    return membership;
  }

  // Shared by every module that needs "is this user allowed to touch this
  // org's data" — no granular per-resource role exists yet, so plain
  // membership is the bar (Projects, Tasks, ...).
  async assertMembership(organizationId: number, userId: number) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }
    return membership;
  }

  // Also reused by ApiKeys/Webhooks (Developer Settings) — org-level
  // credentials are admin-only, same bar as invitations/role changes.
  async assertAdmin(organizationId: number, userId: number) {
    const membership = await this.assertMembership(organizationId, userId);
    if (!ADMIN_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only owners and admins can do this');
    }
    return membership;
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let suffix = 1;
    while (
      await this.prisma.organization.findUnique({ where: { slug: candidate } })
    ) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }
}
