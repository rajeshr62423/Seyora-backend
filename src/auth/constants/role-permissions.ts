import { Permission } from '../enums/permission.enum';
import { Role } from '../enums/role.enum';

const ADMIN_PERMISSIONS: Permission[] = [
  // Organization — view/update only; ORG_DELETE is ownership-sensitive and
  // deliberately withheld from ADMIN per the role's own spec ("cannot
  // perform ownership-sensitive operations").
  Permission.ORG_VIEW,
  Permission.ORG_UPDATE,

  Permission.MEMBER_VIEW,
  Permission.MEMBER_INVITE,
  Permission.MEMBER_UPDATE,
  Permission.MEMBER_REMOVE,

  Permission.PROJECT_VIEW,
  Permission.PROJECT_CREATE,
  Permission.PROJECT_UPDATE,
  Permission.PROJECT_DELETE,

  Permission.TASK_VIEW,
  Permission.TASK_CREATE,
  Permission.TASK_UPDATE,
  Permission.TASK_DELETE,
  Permission.TASK_ASSIGN,
  Permission.TASK_COMMENT,

  Permission.TEAM_VIEW,
  Permission.TEAM_UPDATE,

  Permission.ANALYTICS_VIEW,
  Permission.ACTIVITY_VIEW,

  Permission.MESSAGE_VIEW,
  Permission.MESSAGE_CREATE,
  Permission.MESSAGE_DELETE,

  Permission.NOTIFICATION_VIEW,
  Permission.NOTIFICATION_UPDATE,

  // Not explicitly itemized under the ADMIN role in the spec's category
  // list, but included to preserve existing behavior: today's assertAdmin
  // bar (OWNER + ADMIN) already gates API keys, webhooks, integrations and
  // billing, and ADMIN's own description says "manage integrations" /
  // "general administration" — omitting these would be a regression.
  Permission.API_KEY_VIEW,
  Permission.API_KEY_CREATE,
  Permission.API_KEY_DELETE,

  Permission.WEBHOOK_VIEW,
  Permission.WEBHOOK_CREATE,
  Permission.WEBHOOK_UPDATE,
  Permission.WEBHOOK_DELETE,
  Permission.WEBHOOK_TEST,

  Permission.INTEGRATION_VIEW,
  Permission.INTEGRATION_CONNECT,
  Permission.INTEGRATION_DISCONNECT,

  Permission.BILLING_VIEW,
  Permission.BILLING_MANAGE,

  Permission.SETTINGS_VIEW,
  Permission.SETTINGS_UPDATE,
];

const MANAGER_PERMISSIONS: Permission[] = [
  Permission.ORG_VIEW,
  Permission.MEMBER_VIEW,
  Permission.PROJECT_VIEW,
  Permission.PROJECT_CREATE,
  Permission.PROJECT_UPDATE,
  Permission.TASK_VIEW,
  Permission.TASK_CREATE,
  Permission.TASK_UPDATE,
  Permission.TASK_DELETE,
  Permission.TASK_ASSIGN,
  Permission.TASK_COMMENT,
  Permission.TEAM_VIEW,
  Permission.ANALYTICS_VIEW,
  Permission.ACTIVITY_VIEW,
  Permission.MESSAGE_VIEW,
  Permission.MESSAGE_CREATE,
  Permission.NOTIFICATION_VIEW,
];

const MEMBER_PERMISSIONS: Permission[] = [
  Permission.ORG_VIEW,
  Permission.MEMBER_VIEW,
  Permission.PROJECT_VIEW,
  Permission.TASK_VIEW,
  Permission.TASK_CREATE,
  Permission.TASK_UPDATE,
  Permission.TASK_COMMENT,
  Permission.TEAM_VIEW,
  Permission.ACTIVITY_VIEW,
  Permission.MESSAGE_VIEW,
  Permission.MESSAGE_CREATE,
  Permission.NOTIFICATION_VIEW,
  Permission.NOTIFICATION_UPDATE,
];

const VIEWER_PERMISSIONS: Permission[] = [
  Permission.ORG_VIEW,
  Permission.MEMBER_VIEW,
  Permission.PROJECT_VIEW,
  Permission.TASK_VIEW,
  Permission.TEAM_VIEW,
  Permission.ANALYTICS_VIEW,
  Permission.ACTIVITY_VIEW,
  Permission.MESSAGE_VIEW,
  Permission.NOTIFICATION_VIEW,
];

// Centralized role -> permission configuration. Kept in TypeScript rather
// than database-backed permission records, per the initial requirement —
// the shape (Record<Role, Permission[]>) is extensible to a DB-backed
// custom-role system later without changing any call site.
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: Object.values(Permission),
  [Role.ADMIN]: ADMIN_PERMISSIONS,
  [Role.MANAGER]: MANAGER_PERMISSIONS,
  [Role.MEMBER]: MEMBER_PERMISSIONS,
  [Role.VIEWER]: VIEWER_PERMISSIONS,
};
