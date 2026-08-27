# Seyora Backend Roadmap

Plan for the backend work remaining to support every page in `seyora-frontend`, which today runs entirely on mock data (`lib/data/*.ts`) except auth. Grounded in the actual mock data shapes and page behavior, not guesses — see the "Source" note under each phase.

## Status

- **Done**: env validation, Prisma + Postgres, `Auth` module (register/login/refresh/me/logout — stateless JWT), the global response envelope (`{status, code, data, message}` via `ResponseInterceptor`/`HttpExceptionFilter`/`@ResponseMessage()`).
- **Everything below**: not started. `users.controller.ts` is an empty stub; no `Project`, `Task`, `Organization`, `Activity`, `Notification`, `Channel/Message`, `Integration`, `ApiKey`, or `Webhook` models exist yet.

**Conventions to keep using for every new module**: the response envelope (`@ResponseMessage('...')` + let `ResponseInterceptor` wrap it), `JwtAuthGuard` on anything not explicitly public, DTOs with `class-validator`, and scoping every query to the authenticated user's organization once Phase 1 lands.

---

## Foundational decisions (resolve in Phase 1, before anything else)

1. **Multi-tenancy: add `Organization` now.** `OrganizationTab` (org name, org ID, default project prefix) already implies every entity — users, projects, tasks — is scoped to an org, but nothing models that yet. Retrofitting this after Projects/Tasks exist is expensive (every query gains a `WHERE organizationId = ...`). **Recommendation: model it from Phase 1**, even though today there's only ever one org per user (no org-switcher in the UI yet).

2. **`role` is two different concepts today — split them.** `User.role` (already live, e.g. "Senior Developer") is a free-text job title. `MembersTab`'s role select (Owner/Admin/Manager/Member) and `InvitePage`'s (Admin/Member) are a *permission* role. Keep `User.role` as the job title (don't break existing auth code), and add a separate `OrganizationMember.role` enum for permissions.

3. **Human-readable task codes** (`DEV-241`) tie to `OrganizationTab`'s "default project prefix" field — needs a per-organization counter, not a raw DB id exposed to users.

4. **Denormalized mock fields → real relations.** Mock types store `actorName`, `assigneeInitials`, `projectName` etc. directly. Prisma models below use real foreign keys (`actorId`, `assigneeId`, `projectId`); the API layer joins/includes, and the frontend will need light adaptation (read `.assignee.name` instead of a flat `assigneeName` string) when each module gets wired up.

5. **"Active sessions" (Settings → Security) conflicts with the stateless-JWT decision.** Listing/revoking sessions requires persisting refresh tokens server-side, which is exactly what "stateless, no revocation" (the v1 auth decision) opted out of. Flagged in Phase 5 as a scope call to make then, not now.

---

## Phase 1 — Organizations, real Users, Projects

**Unblocks**: Team page (currently a mocked redux saga), the "create project" flow (currently in-memory only via `ProjectsContext`, resets on reload), project edit/archive (buttons exist, do nothing).

```prisma
model Organization {
  id            Int      @id @default(autoincrement())
  name          String
  slug          String   @unique
  projectPrefix String   @default("DEV")
  timezone      String   @default("UTC")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  members       OrganizationMember[]
  projects      Project[]
}

enum OrgRole {
  OWNER
  ADMIN
  MANAGER
  MEMBER
}

model OrganizationMember {
  id             Int          @id @default(autoincrement())
  organizationId Int
  userId         Int
  role           OrgRole      @default(MEMBER)
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])

  @@unique([organizationId, userId])
}

enum ProjectStatus {
  BACKLOG
  IN_PROGRESS
  IN_REVIEW
  ON_TRACK
}

model Project {
  id             Int           @id @default(autoincrement())
  organizationId Int
  name           String
  slug           String
  description    String?
  status         ProjectStatus @default(BACKLOG)
  color          String        @default("#10B981")
  dueDate        DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  organization   Organization  @relation(fields: [organizationId], references: [id])
  members        ProjectMember[]

  @@unique([organizationId, slug])
}

model ProjectMember {
  id        Int     @id @default(autoincrement())
  projectId Int
  userId    Int
  project   Project @relation(fields: [projectId], references: [id])
  user      User    @relation(fields: [userId], references: [id])

  @@unique([projectId, userId])
}
```

(`progress`/`taskCount` on `Project` are dropped as stored fields — compute them from the `Task` table in Phase 2 instead of storing derived data that can drift.)

**Endpoints**:
- `GET /users` — list + search (unblocks the `users` redux saga's mocked `requestUsers`)
- `GET /users/:id`
- `PATCH /users/me` — Profile tab's "Save changes" (currently a no-op toast)
- `POST /organizations` — onboarding org creation
- `PATCH /organizations/:id`
- `GET /projects` — search, filter by status/member/due-date, sort
- `POST /projects`
- `GET /projects/:slug`
- `PATCH /projects/:id` — edit + archive (add `archivedAt DateTime?` if archiving shouldn't hard-delete)

---

## Phase 2 — Tasks

**Unblocks**: `ProjectBoardPage` (kanban drag-drop, currently doesn't persist), `ProjectTasksPage`, `MyTasksPage`, `TaskDetailModal` (subtasks/comments are local-only today).

```prisma
enum TaskStatus {
  BACKLOG
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

model Task {
  id           Int          @id @default(autoincrement())
  code         String       // e.g. "DEV-241", generated from Organization.projectPrefix + per-org counter
  projectId    Int
  assigneeId   Int?
  title        String
  description  String?
  status       TaskStatus   @default(TODO)
  priority     TaskPriority @default(MEDIUM)
  dueDate      DateTime?
  completedAt  DateTime?    // needed later for Phase 7 analytics
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  project      Project      @relation(fields: [projectId], references: [id])
  assignee     User?        @relation(fields: [assigneeId], references: [id])
  subtasks     Subtask[]
  comments     TaskComment[]

  @@unique([projectId, code])
}

model Subtask {
  id        Int     @id @default(autoincrement())
  taskId    Int
  title     String
  done      Boolean @default(false)
  task      Task    @relation(fields: [taskId], references: [id])
}

model TaskComment {
  id        Int      @id @default(autoincrement())
  taskId    Int
  authorId  Int
  body      String
  createdAt DateTime @default(now())
  task      Task     @relation(fields: [taskId], references: [id])
  author    User     @relation(fields: [authorId], references: [id])
}
```

**Endpoints**:
- `GET /projects/:id/tasks`, `POST /projects/:id/tasks`
- `GET /tasks/me` — cross-project "My Tasks" (today/upcoming/overdue buckets can stay client-computed from `dueDate`)
- `GET /tasks/:id`, `PATCH /tasks/:id` — status/priority/assignee/dueDate/title/description; the kanban drag-drop is just this with `{status}`
- `POST/PATCH/DELETE /tasks/:id/subtasks`
- `GET/POST /tasks/:id/comments`

---

## Phase 3 — Activity & Notifications

**Unblocks**: `ActivityPage`, `ProjectActivityPage`, `AuditLogsTab` (all three already reuse the same `ActivityFeed` component), `NotificationsPage`.

```prisma
model ActivityEntry {
  id             Int      @id @default(autoincrement())
  organizationId Int
  actorId        Int
  action         String   // "created task", "changed priority to High", etc.
  targetType     String   // "project" | "task" | "member" | ...
  targetId       Int
  targetLabel    String   // denormalized display name, snapshot at write time
  createdAt      DateTime @default(now())
  actor          User     @relation(fields: [actorId], references: [id])
}

enum NotificationCategory {
  MENTION
  ASSIGN
  COMMENT
  UPDATE
  SYSTEM
}

model Notification {
  id          Int                   @id @default(autoincrement())
  recipientId Int
  actorId     Int?
  verb        String
  targetLabel String
  category    NotificationCategory
  unread      Boolean               @default(true)
  createdAt   DateTime              @default(now())
  recipient   User                  @relation("NotificationRecipient", fields: [recipientId], references: [id])
}
```

Both tables are **written as side effects** of Phase 1/2 actions (creating a project, changing a task's status, assigning someone) — build a small injectable `ActivityService.log(...)` / `NotificationsService.notify(...)` in `common/` and call it from `ProjectsService`/`TasksService`, rather than writing activity/notification rows inline in every controller.

**Endpoints**:
- `GET /activity` — paginated, filterable by actor/project/date (also serves Audit Logs)
- `GET /notifications`, `PATCH /notifications/:id` (`{unread: false}`), `PATCH /notifications/read-all`

---

## Phase 4 — Messages (Chat)

**Unblocks**: `MessagesPage`. Note: the current mock has a real bug worth fixing here — `ChatMessage` has no `channelId`, so the message list doesn't actually filter by selected channel. The schema below fixes that.

```prisma
model Channel {
  id             Int      @id @default(autoincrement())
  organizationId Int
  name           String
  createdAt      DateTime @default(now())
}

model ChannelMember {
  id        Int     @id @default(autoincrement())
  channelId Int
  userId    Int
  channel   Channel @relation(fields: [channelId], references: [id])
  user      User    @relation(fields: [userId], references: [id])

  @@unique([channelId, userId])
}

model Message {
  id        Int      @id @default(autoincrement())
  channelId Int
  authorId  Int
  text      String
  createdAt DateTime @default(now())
  channel   Channel  @relation(fields: [channelId], references: [id])
  author    User     @relation(fields: [authorId], references: [id])
}
```

**Endpoints**: `GET/POST /channels`, `GET /channels/:id/messages`, `POST /channels/:id/messages`.

**Scope flag**: polling `GET /channels/:id/messages` is fine for a first pass; real-time delivery needs a NestJS `@WebSocketGateway` (socket.io) plus a frontend socket client — bigger addition, worth its own decision point when this phase starts.

---

## Phase 5 — Team & Org Settings

**Unblocks**: `MembersTab`, `InvitePage`/onboarding invite flow, `SecurityTab`, `NotificationsTab` (settings).

```prisma
model Invitation {
  id             Int      @id @default(autoincrement())
  organizationId Int
  email          String
  role           OrgRole  @default(MEMBER)
  token          String   @unique
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime @default(now())
}

model NotificationPreference {
  id                   Int     @id @default(autoincrement())
  userId               Int     @unique
  emailEnabled         Boolean @default(true)
  taskAssignments      Boolean @default(true)
  mentions             Boolean @default(true)
  comments             Boolean @default(true)
  projectUpdates       Boolean @default(true)
  securityAlerts       Boolean @default(true)
  weeklySummary        Boolean @default(false)
  user                 User    @relation(fields: [userId], references: [id])
}
```

**Endpoints**:
- `PATCH /organizations/:id/members/:memberId/role`
- `POST /organizations/:id/invitations` (bulk), `POST /invitations/:token/accept`
- `GET/PATCH /users/me/notification-preferences`
- `POST /auth/change-password`
- **Decision needed**: real "Active sessions" list/revoke requires persisting refresh tokens (see Foundational Decisions #5) — either scope this down to "just change password, skip session listing" or revisit the stateless-JWT decision when this phase starts.

---

## Phase 6 — Developer Settings

**Unblocks**: `ApiTab`, `WebhooksTab`.

```prisma
model ApiKey {
  id             Int       @id @default(autoincrement())
  organizationId Int
  name           String
  hashedKey      String    // same bcrypt approach as passwords; show the raw key once, on create
  lastUsedAt     DateTime?
  revokedAt      DateTime?
  createdAt      DateTime  @default(now())
}

model Webhook {
  id              Int       @id @default(autoincrement())
  organizationId  Int
  url             String
  events          String[]  // e.g. ["task.*", "project.*"]
  secret          String
  lastDeliveryAt  DateTime?
  createdAt       DateTime  @default(now())
}
```

**Endpoints**: `GET/POST/DELETE /api-keys`, `GET/POST/DELETE /webhooks`, `POST /webhooks/:id/test`.

**Scope flag**: actually *delivering* webhook payloads on real events (vs. just CRUD + a fake "test" ping) is a meaningfully bigger feature (retry logic, delivery log, signing) — treat "CRUD + test button" as the MVP here, real delivery as a later add-on.

---

## Phase 7 — Analytics

`AnalyticsPage` today fabricates everything (`completed = assigned * 0.82`, hardcoded `"38 pts"` velocity) — there's no backing data for velocity or avg-completion-time anywhere.

**Recommendation**: start with real aggregation queries that need **no new fields** beyond what Phase 2 already added (`Task.completedAt`, `Task.status`, `Task.priority`): completion rate, overdue count, tasks-by-status, tasks-by-priority. Defer "velocity" and "avg completion time" until there's a concept of estimates/sprints worth adding — don't invent a sprint model speculatively.

**Endpoints**: `GET /analytics/overview?range=7|30|90`, `GET /analytics/team-performance`.

---

## Phase 8 — Integrations & Billing (lower priority, larger scope)

Both are effectively separate subsystems, not simple CRUD:

- **Integrations**: `Integration`/`IntegrationConnection` model (per-org connection status) is easy; the GitHub page's commits/PRs are fully fabricated today and a real version means actual GitHub OAuth + API calls — scope as its own project when it comes up.
- **Billing**: `BillingTab` is fully static (plan, usage bars). Real billing almost certainly means integrating a payment provider (Stripe or similar), not just a Prisma model — flag for a separate decision, don't start it as a normal CRUD phase.

---

## Suggested order

Phases are ordered by dependency (each builds on the previous) and by how many pages they unblock. Phase 1 is the natural starting point — it's also the smallest gap (`users.controller.ts` is currently empty, and it directly replaces the one already-mocked redux saga).

Say which phase (or specific piece) to start on when ready.
