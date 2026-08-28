import { SetMetadata } from '@nestjs/common';
import { Permission } from '../enums/permission.enum';

export const PERMISSIONS_KEY = 'permissions';

// Marks a route as requiring the caller to hold ALL of the given
// permissions (AND semantics) in their current organization, checked by
// PermissionsGuard. e.g. @RequirePermission(Permission.PROJECT_CREATE), or
// @RequirePermission(Permission.PROJECT_UPDATE, Permission.PROJECT_DELETE).
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
