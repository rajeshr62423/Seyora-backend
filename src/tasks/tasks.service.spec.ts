import { NotificationCategory, OrgRole } from '@prisma/client';
import type { ActivityService } from '../activity/activity.service';
import type { MailService } from '../common/mail/mail.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

const ACTOR_ID = 1;
const OLD_ASSIGNEE_ID = 2;
const NEW_ASSIGNEE_ID = 3;
const TASK_ID = 100;
const ORG_ID = 1;

const BASE_TASK = {
  id: TASK_ID,
  organizationId: ORG_ID,
  projectId: 10,
  code: 'DEV-1',
  title: 'Fix login bug',
  description: 'Users cannot log in on Safari',
  status: 'TODO',
  priority: 'MEDIUM',
  dueDate: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  project: { name: 'Acme Project' },
};

function createService(
  overrides: {
    existingAssigneeId?: number | null;
    updatedAssignee?: { id: number; name: string; email: string } | null;
    sendTaskAssignmentEmail?: () => Promise<void>;
  } = {},
) {
  const findUniqueTask = jest.fn().mockResolvedValue({
    ...BASE_TASK,
    assigneeId: overrides.existingAssigneeId ?? OLD_ASSIGNEE_ID,
  });

  const updateTask = jest
    .fn()
    .mockImplementation(
      ({ data }: { data: { assigneeId?: number | null } }) => {
        const assignee =
          'updatedAssignee' in overrides
            ? overrides.updatedAssignee
            : data.assigneeId
              ? {
                  id: data.assigneeId,
                  name: 'New Assignee',
                  email: 'new-assignee@example.com',
                }
              : null;
        return Promise.resolve({
          ...BASE_TASK,
          assigneeId: data.assigneeId ?? null,
          assignee,
          subtasks: [],
          comments: [],
        });
      },
    );

  const findUniqueUser = jest.fn().mockResolvedValue({ name: 'Actor Name' });

  const prisma = {
    task: { findUnique: findUniqueTask, update: updateTask },
    user: { findUnique: findUniqueUser },
  } as unknown as PrismaService;

  const assertMembership = jest.fn().mockResolvedValue({ role: OrgRole.ADMIN });
  const organizationsService = {
    assertMembership,
  } as unknown as OrganizationsService;

  const log = jest.fn().mockResolvedValue(undefined);
  const activityService = { log } as unknown as ActivityService;

  const notify = jest.fn().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;

  const sendTaskAssignmentEmail = jest
    .fn()
    .mockImplementation(
      overrides.sendTaskAssignmentEmail ?? (() => Promise.resolve(undefined)),
    );
  const mailService = { sendTaskAssignmentEmail } as unknown as MailService;

  return {
    service: new TasksService(
      prisma,
      organizationsService,
      activityService,
      notificationsService,
      mailService,
    ),
    findUniqueTask,
    updateTask,
    notify,
    sendTaskAssignmentEmail,
    log,
  };
}

describe('TasksService#update — assignment notifications', () => {
  it('reassigning from A to B notifies and emails only B, never A', async () => {
    const { service, notify, sendTaskAssignmentEmail } = createService({
      existingAssigneeId: OLD_ASSIGNEE_ID,
      updatedAssignee: {
        id: NEW_ASSIGNEE_ID,
        name: 'New Assignee',
        email: 'new-assignee@example.com',
      },
    });

    await service.update(ACTOR_ID, TASK_ID, { assigneeId: NEW_ASSIGNEE_ID });

    expect(notify).toHaveBeenCalledTimes(1);
    const [notifyArg] = notify.mock.calls[0] as [
      { recipientId: number; category: NotificationCategory },
    ];
    expect(notifyArg.recipientId).toBe(NEW_ASSIGNEE_ID);
    expect(notifyArg.category).toBe(NotificationCategory.ASSIGN);

    expect(sendTaskAssignmentEmail).toHaveBeenCalledTimes(1);
    const [emailArg] = sendTaskAssignmentEmail.mock.calls[0] as [
      { to: string },
    ];
    expect(emailArg.to).toBe('new-assignee@example.com');
  });

  it('does not notify when the task is unassigned (assigneeId: null)', async () => {
    const { service, notify, sendTaskAssignmentEmail } = createService({
      existingAssigneeId: OLD_ASSIGNEE_ID,
      updatedAssignee: null,
    });

    await service.update(ACTOR_ID, TASK_ID, { assigneeId: null });

    expect(notify).not.toHaveBeenCalled();
    expect(sendTaskAssignmentEmail).not.toHaveBeenCalled();
  });

  it('does not notify on self-assignment', async () => {
    const { service, notify, sendTaskAssignmentEmail } = createService({
      existingAssigneeId: OLD_ASSIGNEE_ID,
      updatedAssignee: {
        id: ACTOR_ID,
        name: 'Actor Name',
        email: 'actor@example.com',
      },
    });

    await service.update(ACTOR_ID, TASK_ID, { assigneeId: ACTOR_ID });

    expect(notify).not.toHaveBeenCalled();
    expect(sendTaskAssignmentEmail).not.toHaveBeenCalled();
  });

  it('does not notify when re-submitting the same existing assignee (retry / no-op)', async () => {
    const { service, notify, sendTaskAssignmentEmail } = createService({
      existingAssigneeId: OLD_ASSIGNEE_ID,
      updatedAssignee: {
        id: OLD_ASSIGNEE_ID,
        name: 'Old Assignee',
        email: 'old-assignee@example.com',
      },
    });

    await service.update(ACTOR_ID, TASK_ID, { assigneeId: OLD_ASSIGNEE_ID });

    expect(notify).not.toHaveBeenCalled();
    expect(sendTaskAssignmentEmail).not.toHaveBeenCalled();
  });

  it('does not touch assignment fields when the request has no assigneeId at all', async () => {
    const { service, notify, sendTaskAssignmentEmail } = createService({
      existingAssigneeId: OLD_ASSIGNEE_ID,
      updatedAssignee: {
        id: OLD_ASSIGNEE_ID,
        name: 'Old Assignee',
        email: 'old-assignee@example.com',
      },
    });

    await service.update(ACTOR_ID, TASK_ID, { title: 'Renamed' });

    expect(notify).not.toHaveBeenCalled();
    expect(sendTaskAssignmentEmail).not.toHaveBeenCalled();
  });

  it('still creates the in-app notification and resolves successfully when the email fails', async () => {
    const { service, notify, sendTaskAssignmentEmail } = createService({
      existingAssigneeId: OLD_ASSIGNEE_ID,
      updatedAssignee: {
        id: NEW_ASSIGNEE_ID,
        name: 'New Assignee',
        email: 'new-assignee@example.com',
      },
      sendTaskAssignmentEmail: () => Promise.reject(new Error('smtp down')),
    });

    await expect(
      service.update(ACTOR_ID, TASK_ID, { assigneeId: NEW_ASSIGNEE_ID }),
    ).resolves.toBeDefined();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(sendTaskAssignmentEmail).toHaveBeenCalledTimes(1);
  });
});

describe('TasksService#create — assignment notifications', () => {
  function createServiceForCreate(
    overrides: {
      assignee?: { id: number; name: string; email: string } | null;
    } = {},
  ) {
    const project = { id: 10, organizationId: ORG_ID, name: 'Acme Project' };
    const findUniqueProject = jest.fn().mockResolvedValue(project);
    const updateOrganization = jest
      .fn()
      .mockResolvedValue({ projectPrefix: 'DEV', taskCounter: 2 });
    const createTask = jest.fn().mockResolvedValue({
      ...BASE_TASK,
      assigneeId: overrides.assignee?.id ?? null,
      assignee: overrides.assignee ?? null,
      subtasks: [],
      comments: [],
    });

    const findUniqueUser = jest.fn().mockResolvedValue({ name: 'Actor Name' });

    const prisma = {
      project: { findUnique: findUniqueProject },
      organization: { update: updateOrganization },
      task: { create: createTask },
      user: { findUnique: findUniqueUser },
    } as unknown as PrismaService;

    const assertMembership = jest
      .fn()
      .mockResolvedValue({ role: OrgRole.ADMIN });
    const organizationsService = {
      assertMembership,
    } as unknown as OrganizationsService;
    const log = jest.fn().mockResolvedValue(undefined);
    const activityService = { log } as unknown as ActivityService;
    const notify = jest.fn().mockResolvedValue(undefined);
    const notificationsService = { notify } as unknown as NotificationsService;
    const sendTaskAssignmentEmail = jest.fn().mockResolvedValue(undefined);
    const mailService = { sendTaskAssignmentEmail } as unknown as MailService;

    return {
      service: new TasksService(
        prisma,
        organizationsService,
        activityService,
        notificationsService,
        mailService,
      ),
      notify,
      sendTaskAssignmentEmail,
    };
  }

  it('notifies and emails the assignee when a task is created with one', async () => {
    const { service, notify, sendTaskAssignmentEmail } = createServiceForCreate(
      {
        assignee: {
          id: NEW_ASSIGNEE_ID,
          name: 'New Assignee',
          email: 'new-assignee@example.com',
        },
      },
    );

    await service.create(ACTOR_ID, 10, {
      title: 'New task',
      assigneeId: NEW_ASSIGNEE_ID,
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(sendTaskAssignmentEmail).toHaveBeenCalledTimes(1);
  });

  it('does not notify when a task is created without an assignee', async () => {
    const { service, notify, sendTaskAssignmentEmail } = createServiceForCreate(
      { assignee: null },
    );

    await service.create(ACTOR_ID, 10, { title: 'New task' });

    expect(notify).not.toHaveBeenCalled();
    expect(sendTaskAssignmentEmail).not.toHaveBeenCalled();
  });
});
