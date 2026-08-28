import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { Permission } from '../enums/permission.enum';
import { ROLE_PERMISSIONS } from '../constants/role-permissions';
import type { RequestUser } from '../strategies/jwt.strategy';

export interface OrgContext {
  organizationId: number;
  role: keyof typeof ROLE_PERMISSIONS;
  permissions: Permission[];
}

// Authorization flow: JwtAuthGuard (must run first) -> current user ->
// current organization -> membership -> role -> permissions -> compare
// against @RequirePermission(). Resource-level "does this specific
// project/task belong to my org" checks stay in the service layer
// (existing assertMembership/assertAdmin calls) — a different, later step
// in the flow this guard doesn't (and can't generically) perform.
//
// Depends on PrismaService directly rather than OrganizationsService so
// this guard works from any module's controller with zero new module
// imports (PrismaModule is @Global()) — same decoupling reason
// messages.service.ts has its own assertChannelMembership instead of
// reusing organizationsService.assertMembership.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePermission() on this route — nothing to check, and
    // nothing changes for routes nobody's decorated yet.
    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser; orgContext?: OrgContext }>();

    if (!request.user) {
      throw new UnauthorizedException();
    }

    // Same "current organization" resolution as
    // OrganizationsService.getCurrentForUser: first membership by
    // createdAt (single-org-per-user today, no org-switcher yet).
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: request.user.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }

    const permissions = ROLE_PERMISSIONS[membership.role];
    const missing = required.filter(
      (permission) => !permissions.includes(permission),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      );
    }

    request.orgContext = {
      organizationId: membership.organizationId,
      role: membership.role,
      permissions,
    };

    return true;
  }
}
