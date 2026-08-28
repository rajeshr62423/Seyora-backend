// Turns a Prisma enum value like 'IN_PROGRESS' into 'In Progress' for
// human-readable activity log text. Matches the frontend's TASK_STATUS_LABEL
// / TASK_PRIORITY_LABEL text exactly (lib/status.ts) since both apply the
// same per-word capitalization to the same enum values.
export function formatEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
