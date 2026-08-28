import { ConflictException, ForbiddenException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import type { AuthService } from '../auth/auth.service';
import type { MailService } from '../common/mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UsersService } from '../users/users.service';
import { OrganizationsService } from './organizations.service';

const ORG = {
  id: 1,
  name: 'Acme',
  slug: 'acme',
  projectPrefix: 'DEV',
  timezone: 'UTC',
};
const ACTING_USER_ID = 1;
const TARGET_USER_ID = 99;

function createService(overrides: {
  actingRole?: OrgRole;
  targetMembership?: { id: number; role: OrgRole } | null;
  ownerCount?: number;
  prisma?: Partial<{
    invitation: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
    organizationMember: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  }>;
  configService?: Partial<{ get: jest.Mock }>;
  mailService?: Partial<MailService>;
  authService?: Partial<AuthService>;
  usersService?: Partial<UsersService>;
}) {
  const actingRole = overrides.actingRole ?? OrgRole.ADMIN;

  const findFirst = jest.fn().mockResolvedValue({
    organizationId: ORG.id,
    organization: ORG,
    role: actingRole,
  });

  // findUnique is called for BOTH the acting user's own membership (via
  // assertAdmin -> assertMembership) and the target's membership row —
  // must discriminate by which userId was actually queried, or a test
  // that sets the target to a non-admin role would wrongly make the
  // acting-user admin check fail too.
  const findUnique = jest.fn().mockImplementation(
    ({
      where,
    }: {
      where: {
        organizationId_userId: { organizationId: number; userId: number };
      };
    }) => {
      const { userId } = where.organizationId_userId;
      if (userId === ACTING_USER_ID) {
        return Promise.resolve({
          id: 1,
          organizationId: ORG.id,
          userId: ACTING_USER_ID,
          role: actingRole,
        });
      }
      if (overrides.targetMembership === null) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        id: overrides.targetMembership?.id ?? 2,
        organizationId: ORG.id,
        userId: TARGET_USER_ID,
        role: overrides.targetMembership?.role ?? OrgRole.MEMBER,
      });
    },
  );
  const count = jest.fn().mockResolvedValue(overrides.ownerCount ?? 2);
  const update = jest
    .fn()
    .mockImplementation(({ data }: { data: { role: OrgRole } }) =>
      Promise.resolve({
        id: 2,
        organizationId: ORG.id,
        userId: 99,
        role: data.role,
        createdAt: new Date(),
        user: {
          id: 99,
          name: 'Target',
          email: 't@example.com',
          role: 'Member',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    );

  const prisma = {
    organizationMember: { findFirst, findUnique, count, update },
    ...overrides.prisma,
  } as unknown as PrismaService;

  const configService = {
    get: jest.fn(),
    ...overrides.configService,
  } as unknown as import('@nestjs/config').ConfigService;

  const mailService = {
    sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
    ...overrides.mailService,
  } as unknown as MailService;

  const authService = {
    hashPassword: jest.fn().mockResolvedValue('hashed'),
    issueSessionForUser: jest.fn().mockReturnValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {
        id: '1',
        name: 'New User',
        email: 'new@example.com',
        role: 'Member',
        initials: 'NU',
        avatarUrl: null,
      },
    }),
    ...overrides.authService,
  } as unknown as AuthService;

  const usersService = {
    findByEmail: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
      id: 42,
      name: 'New User',
      email: 'new@example.com',
    }),
    ...overrides.usersService,
  } as unknown as UsersService;

  return {
    service: new OrganizationsService(
      prisma,
      configService,
      mailService,
      authService,
      usersService,
    ),
    findUnique,
    update,
    prisma,
    configService,
    mailService,
    authService,
    usersService,
  };
}

describe('OrganizationsService#updateMemberRole', () => {
  // Scenario 12: a caller can never change their own role, regardless of
  // what's in the request body — closes the one gap where "users cannot
  // arbitrarily change their own role" wasn't already true (the acting
  // admin could otherwise self-promote to OWNER or self-demote).
  it('rejects a user attempting to change their own role', async () => {
    const { service } = createService({});
    await expect(
      service.updateMemberRole(5, 5, { role: OrgRole.ADMIN }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // Scenario 11: the last remaining OWNER cannot be demoted through the
  // normal member-role-update path.
  it('rejects demoting the last remaining OWNER', async () => {
    const { service, findUnique } = createService({
      targetMembership: { id: 2, role: OrgRole.OWNER },
      ownerCount: 1,
    });
    await expect(
      service.updateMemberRole(1, 99, { role: OrgRole.ADMIN }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).toHaveBeenCalled();
  });

  // Not scenario 11: demoting an OWNER is fine as long as another OWNER
  // remains — confirms the guard above is scoped to "last owner", not
  // "any owner".
  it('allows demoting an OWNER when another OWNER remains', async () => {
    const { service, update } = createService({
      targetMembership: { id: 2, role: OrgRole.OWNER },
      ownerCount: 2,
    });
    const result = await service.updateMemberRole(1, 99, {
      role: OrgRole.ADMIN,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: OrgRole.ADMIN } }),
    );
    expect(result.role).toBe(OrgRole.ADMIN);
  });

  // The server always re-derives the target's CURRENT role from the DB row
  // (via findUnique) before deciding whether the owner-protection check
  // applies — a caller-supplied role in the request body only ever
  // determines the NEW role being requested (validated by
  // UpdateMemberRoleDto's @IsEnum(OrgRole)), never what the target
  // "currently is" or what the caller's own role is assumed to be.
  it('never trusts a client-supplied role for the acting user or the target — only the validated DTO field for the new role', async () => {
    const { service, findUnique } = createService({
      targetMembership: { id: 2, role: OrgRole.MEMBER },
      ownerCount: 2,
    });
    await service.updateMemberRole(1, 99, { role: OrgRole.MANAGER });
    // The lookup for the target's role came from the DB (findUnique), not
    // from anything in the request payload.
    expect(findUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: ORG.id, userId: 99 } },
    });
  });
});

const FUTURE = new Date(Date.now() + 1000 * 60 * 60);
const PAST = new Date(Date.now() - 1000 * 60 * 60);

describe('OrganizationsService#createInvitations', () => {
  it('rejects inviting an OWNER when the acting user is only an ADMIN', async () => {
    const invitationCreate = jest.fn();
    const { service } = createService({
      actingRole: OrgRole.ADMIN,
      prisma: {
        invitation: { create: invitationCreate } as unknown as Record<
          string,
          jest.Mock
        >,
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: ACTING_USER_ID, name: 'Actor' }),
        } as unknown as Record<string, jest.Mock>,
      },
    });

    await expect(
      service.createInvitations(ACTING_USER_ID, {
        invites: [{ email: 'new@example.com', role: OrgRole.OWNER }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitationCreate).not.toHaveBeenCalled();
  });

  it('allows an OWNER to invite a new OWNER and sends the invitation email', async () => {
    const invitation = {
      id: 1,
      email: 'new@example.com',
      role: OrgRole.OWNER,
      token: 'tok',
      organizationId: ORG.id,
    };
    const invitationCreate = jest.fn().mockResolvedValue(invitation);
    const sendInvitationEmail = jest.fn().mockResolvedValue(undefined);
    const { service } = createService({
      actingRole: OrgRole.OWNER,
      prisma: {
        invitation: { create: invitationCreate } as unknown as Record<
          string,
          jest.Mock
        >,
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: ACTING_USER_ID, name: 'Actor' }),
        } as unknown as Record<string, jest.Mock>,
      },
      mailService: { sendInvitationEmail },
    });

    const result = await service.createInvitations(ACTING_USER_ID, {
      invites: [{ email: 'new@example.com', role: OrgRole.OWNER }],
    });

    expect(sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        role: OrgRole.OWNER,
        inviterName: 'Actor',
      }),
    );
    expect(result.invitations).toHaveLength(1);
    expect(result.failedEmails).toHaveLength(0);
  });

  it('rolls back the invitation row and reports the address when the email fails to send', async () => {
    const invitation = {
      id: 1,
      email: 'new@example.com',
      role: OrgRole.MEMBER,
      token: 'tok',
      organizationId: ORG.id,
    };
    const invitationCreate = jest.fn().mockResolvedValue(invitation);
    const invitationDelete = jest.fn().mockResolvedValue(invitation);
    const sendInvitationEmail = jest
      .fn()
      .mockRejectedValue(new Error('smtp down'));
    const { service } = createService({
      prisma: {
        invitation: {
          create: invitationCreate,
          delete: invitationDelete,
        } as unknown as Record<string, jest.Mock>,
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: ACTING_USER_ID, name: 'Actor' }),
        } as unknown as Record<string, jest.Mock>,
      },
      mailService: { sendInvitationEmail },
    });

    await expect(
      service.createInvitations(ACTING_USER_ID, {
        invites: [{ email: 'new@example.com' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(invitationDelete).toHaveBeenCalledWith({
      where: { id: invitation.id },
    });
  });
});

describe('OrganizationsService#acceptInvitation', () => {
  it('rejects a revoked invitation', async () => {
    const invitationFindUnique = jest.fn().mockResolvedValue({
      id: 1,
      token: 'tok',
      email: 'a@example.com',
      organizationId: ORG.id,
      role: OrgRole.MEMBER,
      acceptedAt: null,
      revokedAt: new Date(),
      expiresAt: FUTURE,
    });
    const { service } = createService({
      prisma: {
        invitation: { findUnique: invitationFindUnique } as unknown as Record<
          string,
          jest.Mock
        >,
      },
    });

    await expect(
      service.acceptInvitation(ACTING_USER_ID, 'tok'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an expired invitation', async () => {
    const invitationFindUnique = jest.fn().mockResolvedValue({
      id: 1,
      token: 'tok',
      email: 'a@example.com',
      organizationId: ORG.id,
      role: OrgRole.MEMBER,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: PAST,
    });
    const { service } = createService({
      prisma: {
        invitation: { findUnique: invitationFindUnique } as unknown as Record<
          string,
          jest.Mock
        >,
      },
    });

    await expect(
      service.acceptInvitation(ACTING_USER_ID, 'tok'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an already-accepted invitation', async () => {
    const invitationFindUnique = jest.fn().mockResolvedValue({
      id: 1,
      token: 'tok',
      email: 'a@example.com',
      organizationId: ORG.id,
      role: OrgRole.MEMBER,
      acceptedAt: new Date(),
      revokedAt: null,
      expiresAt: FUTURE,
    });
    const { service } = createService({
      prisma: {
        invitation: { findUnique: invitationFindUnique } as unknown as Record<
          string,
          jest.Mock
        >,
      },
    });

    await expect(
      service.acceptInvitation(ACTING_USER_ID, 'tok'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('OrganizationsService#getInvitationPreview', () => {
  it('returns the organization name, role, and email for a valid invitation', async () => {
    const invitationFindUnique = jest.fn().mockResolvedValue({
      id: 1,
      token: 'tok',
      email: 'invitee@example.com',
      organizationId: ORG.id,
      role: OrgRole.MANAGER,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: FUTURE,
    });
    const organizationFindUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({ ...ORG });
    const { service } = createService({
      prisma: {
        invitation: { findUnique: invitationFindUnique } as unknown as Record<
          string,
          jest.Mock
        >,
        organization: {
          findUniqueOrThrow: organizationFindUniqueOrThrow,
        } as unknown as Record<string, jest.Mock>,
      },
    });

    const preview = await service.getInvitationPreview('tok');
    expect(preview).toEqual({
      organizationName: ORG.name,
      role: OrgRole.MANAGER,
      email: 'invitee@example.com',
      expiresAt: FUTURE,
    });
  });

  it('rejects previewing a revoked invitation', async () => {
    const invitationFindUnique = jest.fn().mockResolvedValue({
      id: 1,
      token: 'tok',
      email: 'invitee@example.com',
      organizationId: ORG.id,
      role: OrgRole.MEMBER,
      acceptedAt: null,
      revokedAt: new Date(),
      expiresAt: FUTURE,
    });
    const { service } = createService({
      prisma: {
        invitation: { findUnique: invitationFindUnique } as unknown as Record<
          string,
          jest.Mock
        >,
      },
    });

    await expect(service.getInvitationPreview('tok')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('OrganizationsService#registerViaInvitation', () => {
  const validInvitation = {
    id: 1,
    token: 'tok',
    email: 'new@example.com',
    organizationId: ORG.id,
    role: OrgRole.MEMBER,
    acceptedAt: null,
    revokedAt: null,
    expiresAt: FUTURE,
  };

  it('rejects when an account with the invited email already exists', async () => {
    const invitationFindUnique = jest.fn().mockResolvedValue(validInvitation);
    const { service } = createService({
      prisma: {
        invitation: { findUnique: invitationFindUnique } as unknown as Record<
          string,
          jest.Mock
        >,
      },
      usersService: { findByEmail: jest.fn().mockResolvedValue({ id: 5 }) },
    });

    await expect(
      service.registerViaInvitation('tok', {
        name: 'New User',
        password: 'password123',
        confirmPassword: 'password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates the account and organization membership, then issues a session, using the invitation email (never a client-supplied one)', async () => {
    const invitationFindUnique = jest.fn().mockResolvedValue(validInvitation);
    const invitationUpdate = jest
      .fn()
      .mockResolvedValue({ ...validInvitation, acceptedAt: new Date() });
    const memberCreate = jest.fn().mockResolvedValue({ id: 1 });
    const transaction = jest.fn().mockResolvedValue([{}, {}]);
    const createdUser = { id: 42, name: 'New User', email: 'new@example.com' };
    const usersCreate = jest.fn().mockResolvedValue(createdUser);
    const hashPassword = jest.fn().mockResolvedValue('hashed-password');
    const issueSessionForUser = jest.fn().mockReturnValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {
        id: '42',
        name: 'New User',
        email: 'new@example.com',
        role: 'Member',
        initials: 'NU',
        avatarUrl: null,
      },
    });

    const { service } = createService({
      prisma: {
        invitation: {
          findUnique: invitationFindUnique,
          update: invitationUpdate,
        } as unknown as Record<string, jest.Mock>,
        organizationMember: { create: memberCreate } as unknown as Record<
          string,
          jest.Mock
        >,
        $transaction: transaction,
      },
      usersService: {
        findByEmail: jest.fn().mockResolvedValue(null),
        create: usersCreate,
      },
      authService: { hashPassword, issueSessionForUser },
    });

    const result = await service.registerViaInvitation('tok', {
      name: 'New User',
      password: 'password123',
      confirmPassword: 'password123',
    });

    expect(hashPassword).toHaveBeenCalledWith('password123');
    expect(usersCreate).toHaveBeenCalledWith({
      name: 'New User',
      email: 'new@example.com', // the invitation's own email, not any client-supplied field
      passwordHash: 'hashed-password',
    });
    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { organizationId: ORG.id, userId: 42, role: OrgRole.MEMBER },
      }),
    );
    expect(issueSessionForUser).toHaveBeenCalledWith(createdUser);
    expect(result.user.email).toBe('new@example.com');
  });
});
