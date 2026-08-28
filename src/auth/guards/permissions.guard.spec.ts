import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { Permission } from '../enums/permission.enum';
import type { RequestUser } from '../strategies/jwt.strategy';
import { PermissionsGuard } from './permissions.guard';

interface FakeRequest {
  user?: RequestUser;
  orgContext?: unknown;
}

function createContext(request: FakeRequest): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function createGuard(
  required: Permission[] | undefined,
  membershipRole: OrgRole | null,
) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;

  const findFirst = jest.fn().mockResolvedValue(
    membershipRole === null
      ? null
      : {
          organizationId: 1,
          userId: 1,
          role: membershipRole,
          createdAt: new Date(),
        },
  );
  const prisma = {
    organizationMember: { findFirst },
  } as unknown as PrismaService;

  const guard = new PermissionsGuard(reflector, prisma);
  return { guard, findFirst };
}

describe('PermissionsGuard', () => {
  it('returns true immediately when no @RequirePermission() metadata is set (existing unguarded routes stay unaffected)', async () => {
    const { guard } = createGuard(undefined, null);
    const request: FakeRequest = { user: { id: 1 } };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('throws UnauthorizedException when there is no authenticated user', async () => {
    const { guard } = createGuard([Permission.PROJECT_VIEW], OrgRole.MEMBER);
    const request: FakeRequest = {};
    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws ForbiddenException when the user has no organization membership', async () => {
    const { guard } = createGuard([Permission.PROJECT_VIEW], null);
    const request: FakeRequest = { user: { id: 1 } };
    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('OWNER has every permission (scenario 1)', async () => {
    for (const permission of Object.values(Permission)) {
      const { guard } = createGuard([permission], OrgRole.OWNER);
      const request: FakeRequest = { user: { id: 1 } };
      await expect(guard.canActivate(createContext(request))).resolves.toBe(
        true,
      );
    }
  });

  it('ADMIN passes an administrative permission check (scenario 2)', async () => {
    const { guard } = createGuard([Permission.WEBHOOK_CREATE], OrgRole.ADMIN);
    const request: FakeRequest = { user: { id: 1 } };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('ADMIN is denied the one ownership-sensitive permission it does not hold', async () => {
    const { guard } = createGuard([Permission.ORG_DELETE], OrgRole.ADMIN);
    const request: FakeRequest = { user: { id: 1 } };
    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MANAGER can create and update projects (scenario 3)', async () => {
    const { guard } = createGuard(
      [Permission.PROJECT_CREATE, Permission.PROJECT_UPDATE],
      OrgRole.MANAGER,
    );
    const request: FakeRequest = { user: { id: 1 } };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('MEMBER can create and update tasks (scenario 4)', async () => {
    const { guard } = createGuard(
      [Permission.TASK_CREATE, Permission.TASK_UPDATE],
      OrgRole.MEMBER,
    );
    const request: FakeRequest = { user: { id: 1 } };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('MEMBER cannot access an admin-only permission (scenario 5)', async () => {
    const { guard } = createGuard([Permission.WEBHOOK_CREATE], OrgRole.MEMBER);
    const request: FakeRequest = { user: { id: 1 } };
    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('VIEWER cannot create, update, or delete anything (scenario 6)', async () => {
    const writePermissions = [
      Permission.PROJECT_CREATE,
      Permission.TASK_UPDATE,
      Permission.TASK_DELETE,
      Permission.MEMBER_REMOVE,
    ];
    for (const permission of writePermissions) {
      const { guard } = createGuard([permission], OrgRole.VIEWER);
      const request: FakeRequest = { user: { id: 1 } };
      await expect(
        guard.canActivate(createContext(request)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('VIEWER can still read (scenario 6, positive case)', async () => {
    const { guard } = createGuard([Permission.PROJECT_VIEW], OrgRole.VIEWER);
    const request: FakeRequest = { user: { id: 1 } };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('missing permission throws ForbiddenException (scenario 8)', async () => {
    const { guard } = createGuard([Permission.BILLING_MANAGE], OrgRole.MEMBER);
    const request: FakeRequest = { user: { id: 1 } };
    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the same user resolves a different role for a different organization membership (scenario 10)', async () => {
    // Simulates "User -> Org A: OWNER, Org B: VIEWER" by pointing two guard
    // instances at two different mocked membership rows for the same
    // user id — the guard always re-derives the role from the DB, never
    // caches it across requests/organizations.
    const ownerGuard = createGuard(
      [Permission.PROJECT_DELETE],
      OrgRole.OWNER,
    ).guard;
    const viewerGuard = createGuard(
      [Permission.PROJECT_DELETE],
      OrgRole.VIEWER,
    ).guard;
    const request: FakeRequest = { user: { id: 1 } };

    await expect(ownerGuard.canActivate(createContext(request))).resolves.toBe(
      true,
    );
    await expect(
      viewerGuard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('attaches the resolved organizationId/role/permissions to request.orgContext on success', async () => {
    const { guard } = createGuard([Permission.PROJECT_VIEW], OrgRole.MANAGER);
    const request: FakeRequest = { user: { id: 1 } };
    await guard.canActivate(createContext(request));
    const orgContext = request.orgContext as {
      organizationId: number;
      role: OrgRole;
      permissions: Permission[];
    };
    expect(orgContext.organizationId).toBe(1);
    expect(orgContext.role).toBe(OrgRole.MANAGER);
    expect(orgContext.permissions).toContain(Permission.PROJECT_VIEW);
  });
});
