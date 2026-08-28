import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Invitation } from '@prisma/client';
import { OrgRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import type { AuthResponse } from '../auth/auth.types';
import { ROLE_PERMISSIONS } from '../auth/constants/role-permissions';
import { MailService } from '../common/mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { slugify } from '../common/utils/slugify';
import { deleteUploadedFile, toPublicUploadUrl } from '../uploads/upload.utils';
import { CreateInvitationsDto } from './dto/create-invitations.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { QueryMembersDto } from './dto/query-members.dto';
import { RegisterViaInvitationDto } from './dto/register-via-invitation.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const ADMIN_ROLES: OrgRole[] = [OrgRole.OWNER, OrgRole.ADMIN];
const DEFAULT_INVITATION_EXPIRES_IN_HOURS = 24;
const DEFAULT_MEMBERS_PAGE_SIZE = 20;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

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

  // GET /organizations/me's actual handler — same org as getCurrentForUser
  // (reused, not duplicated) plus the caller's own role/permissions in it,
  // so the frontend can expose `hasPermission()` for UI visibility.
  // getCurrentForUser itself stays untouched since it's called from many
  // other services purely for the plain Organization shape.
  async getCurrentForUserWithAccess(userId: number) {
    const organization = await this.getCurrentForUser(userId);
    const membership = await this.assertMembership(organization.id, userId);
    return {
      ...organization,
      role: membership.role,
      permissions: ROLE_PERMISSIONS[membership.role],
    };
  }

  async updateCurrentForUser(userId: number, input: UpdateOrganizationDto) {
    const organization = await this.getCurrentForUser(userId);
    await this.assertAdmin(organization.id, userId);

    return this.prisma.organization.update({
      where: { id: organization.id },
      data: input,
    });
  }

  // file === null removes the current logo. Same shape as
  // UsersService.setAvatar — resolved after the DB write so a failed
  // delete never leaves the row pointing at a URL that's already gone.
  async setLogo(userId: number, file: Express.Multer.File | null) {
    const organization = await this.getCurrentForUser(userId);
    await this.assertAdmin(organization.id, userId);

    const updated = await this.prisma.organization.update({
      where: { id: organization.id },
      data: { logoUrl: file ? toPublicUploadUrl(file) : null },
    });
    await deleteUploadedFile(organization.logoUrl);
    return updated;
  }

  async listMembers(userId: number, query: QueryMembersDto = {}) {
    const organization = await this.getCurrentForUser(userId);
    await this.assertMembership(organization.id, userId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_MEMBERS_PAGE_SIZE;
    const search = query.search?.trim();

    const where = {
      organizationId: organization.id,
      ...(search
        ? {
            user: {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { role: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [members, total] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.organizationMember.count({ where }),
    ]);

    return {
      items: members.map((member) => ({
        ...member,
        user: UsersService.toPublic(member.user),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async updateMemberRole(
    actingUserId: number,
    targetUserId: number,
    input: UpdateMemberRoleDto,
  ) {
    // Users cannot arbitrarily change their own role — otherwise an ADMIN
    // could self-promote to OWNER, or self-demote to dodge some other
    // check. The target's actual role is always re-derived from the DB
    // row below (never trusted from the request), so this is purely about
    // who the target is, not what role is requested.
    if (targetUserId === actingUserId) {
      throw new ForbiddenException('You cannot change your own role');
    }

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
    const actingMembership = await this.assertAdmin(organization.id, userId);

    // Only an OWNER can hand out OWNER — an ADMIN inviting a new OWNER
    // would otherwise be a privilege-escalation path (ADMIN can already
    // invite freely, and the invited OWNER could then demote/remove the
    // ADMIN who created them).
    if (
      input.invites.some((invite) => invite.role === OrgRole.OWNER) &&
      actingMembership.role !== OrgRole.OWNER
    ) {
      throw new ForbiddenException('Only an owner can invite a new owner');
    }

    const inviter = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const expiresInHours =
      this.configService.get<number>('INVITATION_EXPIRES_IN_HOURS') ??
      DEFAULT_INVITATION_EXPIRES_IN_HOURS;

    const created: Invitation[] = [];
    const failedEmails: string[] = [];

    // Sequential, not Promise.all — a failed send must roll back only its
    // own invitation row (see MailService's failure branch below), and
    // interleaved concurrent writes would make that rollback race-prone.
    for (const invite of input.invites) {
      const invitation = await this.prisma.invitation.create({
        data: {
          organizationId: organization.id,
          email: invite.email,
          role: invite.role ?? OrgRole.MEMBER,
          token: randomBytes(24).toString('hex'),
          expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
        },
      });
      this.logger.log(`Invitation created — invitation ${invitation.id}`);

      try {
        await this.mailService.sendInvitationEmail({
          to: invitation.email,
          organizationName: organization.name,
          role: invitation.role,
          inviterName: inviter?.name,
          inviterEmail: inviter?.email,
          invitationToken: invitation.token,
        });
        created.push(invitation);
      } catch (error) {
        // Don't leave a DB row implying an invite was sent when it wasn't —
        // MailService already logged the technical failure.
        this.logger.warn(
          `Invitation ${invitation.id} rolled back — email delivery failed`,
        );
        await this.prisma.invitation.delete({ where: { id: invitation.id } });
        failedEmails.push(invite.email);
        void error;
      }
    }

    if (created.length === 0 && failedEmails.length > 0) {
      throw new ConflictException(
        'Unable to send invitation email(s). Please try again.',
      );
    }

    return { invitations: created, failedEmails };
  }

  async listInvitations(userId: number) {
    const organization = await this.getCurrentForUser(userId);
    await this.assertAdmin(organization.id, userId);

    return this.prisma.invitation.findMany({
      where: {
        organizationId: organization.id,
        acceptedAt: null,
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin-only cancellation — the frontend's create-invitations flow only
  // ever calls createInvitations, this exists purely so revokedAt (an
  // explicit security requirement — single-use, revocable invitations)
  // isn't a column nothing ever sets.
  async revokeInvitation(userId: number, invitationId: number) {
    const organization = await this.getCurrentForUser(userId);
    await this.assertAdmin(organization.id, userId);

    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation || invitation.organizationId !== organization.id) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.acceptedAt) {
      throw new ConflictException('This invitation has already been accepted');
    }

    return this.prisma.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });
  }

  // Public, unauthenticated lookup — lets the invitation-accept page render
  // "You're invited to join {org} as {role}" (and prefill the email) before
  // the visitor has done anything, without exposing more than the token
  // itself already implies. Same validity checks as accepting, since a
  // preview of an expired/revoked/accepted invitation isn't useful.
  async getInvitationPreview(token: string) {
    const invitation = await this.getAcceptableInvitationOrThrow(token);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: invitation.organizationId },
    });

    return {
      organizationName: organization.name,
      role: invitation.role,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(userId: number, token: string) {
    const invitation = await this.getAcceptableInvitationOrThrow(token);

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
    this.logger.log(`Invitation accepted — invitation ${invitation.id}`);
    return membership;
  }

  // Counterpart to acceptInvitation for an invited email with no existing
  // account yet — creates the User and OrganizationMember together, then
  // signs the new account in immediately (same AuthResponse shape
  // register()/login() already return). The invitation's own email is
  // always what's used for the new account, never anything client-supplied.
  async registerViaInvitation(
    token: string,
    dto: RegisterViaInvitationDto,
  ): Promise<AuthResponse> {
    const invitation = await this.getAcceptableInvitationOrThrow(token);

    const existingUser = await this.usersService.findByEmail(invitation.email);
    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists. Please log in to accept this invitation.',
      );
    }

    const passwordHash = await this.authService.hashPassword(dto.password);
    const user = await this.usersService.create({
      name: dto.name,
      email: invitation.email,
      passwordHash,
    });

    await this.prisma.$transaction([
      this.prisma.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
        },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
    this.logger.log(
      `Invitation accepted via new account — invitation ${invitation.id}`,
    );

    return this.authService.issueSessionForUser(user);
  }

  private async getAcceptableInvitationOrThrow(
    token: string,
  ): Promise<Invitation> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.revokedAt) {
      throw new ForbiddenException('This invitation has been revoked');
    }
    if (invitation.acceptedAt) {
      throw new ConflictException('This invitation has already been accepted');
    }
    if (invitation.expiresAt < new Date()) {
      throw new ForbiddenException('This invitation has expired');
    }
    return invitation;
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
