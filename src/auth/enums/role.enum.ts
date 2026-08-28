// Re-exports Prisma's OrgRole (the schema is the single source of truth for
// which roles exist — OWNER/ADMIN/MANAGER/MEMBER/VIEWER) rather than hand
// declaring a parallel TS enum that could drift out of sync with it.
export { OrgRole as Role } from '@prisma/client';
