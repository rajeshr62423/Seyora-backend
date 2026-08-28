import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationCategory, Prisma, TaskStatus } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { ROLE_PERMISSIONS } from '../auth/constants/role-permissions';
import { Permission } from '../auth/enums/permission.enum';
import { MailService } from '../common/mail/mail.service';
import { formatEnumLabel } from '../common/utils/format-enum-label';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const TASK_INCLUDE = {
  assignee: true,
  subtasks: true,
  comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TaskInclude;

const TASK_WITH_PROJECT_INCLUDE = {
  ...TASK_INCLUDE,
  project: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: typeof TASK_INCLUDE;
}>;
type TaskWithProject = Prisma.TaskGetPayload<{
  include: typeof TASK_WITH_PROJECT_INCLUDE;
}>;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    private readonly activityService: ActivityService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  async findAllForProject(userId: number, projectId: number) {
    const project = await this.getProjectOrThrow(projectId);
    await this.organizationsService.assertMembership(
      project.organizationId,
      userId,
    );

    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      include: TASK_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return tasks.map((task) => this.sanitize(task));
  }

  async findMine(userId: number) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);

    const tasks = await this.prisma.task.findMany({
      where: { organizationId: organization.id, assigneeId: userId },
      include: TASK_WITH_PROJECT_INCLUDE,
      orderBy: { dueDate: 'asc' },
    });
    return tasks.map((task) => this.sanitize(task));
  }

  async create(userId: number, projectId: number, input: CreateTaskDto) {
    const project = await this.getProjectOrThrow(projectId);
    await this.organizationsService.assertMembership(
      project.organizationId,
      userId,
    );
    if (input.assigneeId !== undefined) {
      await this.organizationsService.assertMembership(
        project.organizationId,
        input.assigneeId,
      );
    }

    const code = await this.nextTaskCode(project.organizationId);

    const task = await this.prisma.task.create({
      data: {
        code,
        organizationId: project.organizationId,
        projectId,
        title: input.title,
        description: input.description,
        status: input.status ?? TaskStatus.TODO,
        priority: input.priority,
        assigneeId: input.assigneeId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
      include: TASK_INCLUDE,
    });

    await this.activityService.log({
      organizationId: project.organizationId,
      actorId: userId,
      action: 'created task',
      targetType: 'task',
      targetId: task.id,
      targetLabel: `${task.code}: ${task.title}`,
    });

    if (
      input.assigneeId !== undefined &&
      input.assigneeId !== userId &&
      task.assignee
    ) {
      await this.notifyAssignment({
        actorId: userId,
        assigneeId: input.assigneeId,
        assigneeEmail: task.assignee.email,
        taskCode: task.code,
        taskTitle: task.title,
        taskDescription: task.description,
        projectName: project.name,
        dueDate: task.dueDate,
      });
    }

    return this.sanitize(task);
  }

  async findOne(userId: number, taskId: number) {
    const task = await this.getTaskWithIncludeOrThrow(taskId);
    await this.organizationsService.assertMembership(
      task.organizationId,
      userId,
    );
    return this.sanitize(task);
  }

  // Org is derived from the caller's own membership, never trusted from
  // the URL — a code from a different organization simply won't match the
  // compound unique key, so no separate assertMembership call is needed
  // (same reasoning as findMine).
  async findByCode(userId: number, code: string) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);

    const task = await this.prisma.task.findUnique({
      where: { organizationId_code: { organizationId: organization.id, code } },
      include: TASK_WITH_PROJECT_INCLUDE,
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return this.sanitize(task);
  }

  async update(userId: number, taskId: number, input: UpdateTaskDto) {
    const task = await this.getTaskOrThrow(taskId);
    const actingMembership = await this.organizationsService.assertMembership(
      task.organizationId,
      userId,
    );
    // TASK_UPDATE (checked by PermissionsGuard on the route) covers
    // ordinary field edits; reassigning the task is a stricter, separate
    // permission — MEMBER has TASK_UPDATE but not TASK_ASSIGN, and must
    // still be able to edit a task's other fields without touching its
    // assignee, so this is only enforced when assigneeId is actually part
    // of the request.
    if (input.assigneeId !== undefined) {
      if (
        !ROLE_PERMISSIONS[actingMembership.role].includes(
          Permission.TASK_ASSIGN,
        )
      ) {
        throw new ForbiddenException(
          'Missing required permission: TASK_ASSIGN',
        );
      }
    }
    if (input.assigneeId !== undefined && input.assigneeId !== null) {
      await this.organizationsService.assertMembership(
        task.organizationId,
        input.assigneeId,
      );
    }

    const completing =
      input.status === TaskStatus.DONE && task.status !== TaskStatus.DONE;
    const reopening =
      input.status !== undefined &&
      input.status !== TaskStatus.DONE &&
      task.status === TaskStatus.DONE;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        completedAt: completing ? new Date() : reopening ? null : undefined,
      },
      include: TASK_INCLUDE,
    });

    if (input.status && input.status !== task.status) {
      await this.activityService.log({
        organizationId: task.organizationId,
        actorId: userId,
        action: `changed status from ${formatEnumLabel(task.status)} to ${formatEnumLabel(input.status)}`,
        targetType: 'task',
        targetId: task.id,
        targetLabel: `${task.code}: ${updated.title}`,
      });
    }

    if (input.priority && input.priority !== task.priority) {
      await this.activityService.log({
        organizationId: task.organizationId,
        actorId: userId,
        action: `changed priority from ${formatEnumLabel(task.priority)} to ${formatEnumLabel(input.priority)}`,
        targetType: 'task',
        targetId: task.id,
        targetLabel: `${task.code}: ${updated.title}`,
      });
    }

    const newAssigneeId = input.assigneeId;
    if (
      newAssigneeId !== undefined &&
      newAssigneeId !== null &&
      newAssigneeId !== task.assigneeId
    ) {
      await this.activityService.log({
        organizationId: task.organizationId,
        actorId: userId,
        action: `assigned task to ${updated.assignee?.name ?? 'someone'}`,
        targetType: 'task',
        targetId: task.id,
        targetLabel: `${task.code}: ${updated.title}`,
      });
      if (newAssigneeId !== userId && updated.assignee) {
        await this.notifyAssignment({
          actorId: userId,
          assigneeId: newAssigneeId,
          assigneeEmail: updated.assignee.email,
          taskCode: task.code,
          taskTitle: updated.title,
          taskDescription: updated.description,
          projectName: task.project.name,
          dueDate: updated.dueDate,
        });
      }
    } else if (newAssigneeId === null && task.assigneeId !== null) {
      await this.activityService.log({
        organizationId: task.organizationId,
        actorId: userId,
        action: 'unassigned task',
        targetType: 'task',
        targetId: task.id,
        targetLabel: `${task.code}: ${updated.title}`,
      });
    }

    return this.sanitize(updated);
  }

  async remove(userId: number, taskId: number) {
    const task = await this.getTaskOrThrow(taskId);
    await this.organizationsService.assertMembership(
      task.organizationId,
      userId,
    );

    // Subtasks/comments cascade at the DB level (onDelete: Cascade in the
    // schema) — no manual cleanup needed. ActivityEntry has no FK to Task
    // (targetId is a plain Int), so past entries survive as a denormalized
    // snapshot, same as any other renamed/deleted target.
    await this.prisma.task.delete({ where: { id: taskId } });

    await this.activityService.log({
      organizationId: task.organizationId,
      actorId: userId,
      action: 'deleted task',
      targetType: 'task',
      targetId: task.id,
      targetLabel: `${task.code}: ${task.title}`,
    });

    return { id: taskId };
  }

  async addSubtask(userId: number, taskId: number, input: CreateSubtaskDto) {
    const task = await this.getTaskOrThrow(taskId);
    await this.organizationsService.assertMembership(
      task.organizationId,
      userId,
    );

    return this.prisma.subtask.create({
      data: { taskId, title: input.title },
    });
  }

  async updateSubtask(
    userId: number,
    taskId: number,
    subtaskId: number,
    input: UpdateSubtaskDto,
  ) {
    const task = await this.getTaskOrThrow(taskId);
    await this.organizationsService.assertMembership(
      task.organizationId,
      userId,
    );
    await this.getSubtaskOrThrow(taskId, subtaskId);

    return this.prisma.subtask.update({
      where: { id: subtaskId },
      data: { title: input.title, done: input.done },
    });
  }

  async removeSubtask(userId: number, taskId: number, subtaskId: number) {
    const task = await this.getTaskOrThrow(taskId);
    await this.organizationsService.assertMembership(
      task.organizationId,
      userId,
    );
    await this.getSubtaskOrThrow(taskId, subtaskId);

    await this.prisma.subtask.delete({ where: { id: subtaskId } });
    return { id: subtaskId };
  }

  async addComment(userId: number, taskId: number, input: CreateCommentDto) {
    const task = await this.getTaskOrThrow(taskId);
    await this.organizationsService.assertMembership(
      task.organizationId,
      userId,
    );

    const comment = await this.prisma.taskComment.create({
      data: { taskId, authorId: userId, body: input.body },
      include: { author: true },
    });

    await this.activityService.log({
      organizationId: task.organizationId,
      actorId: userId,
      action: 'commented on task',
      targetType: 'task',
      targetId: task.id,
      targetLabel: `${task.code}: ${task.title}`,
    });

    if (task.assigneeId && task.assigneeId !== userId) {
      await this.notificationsService.notify({
        recipientId: task.assigneeId,
        actorId: userId,
        verb: 'commented on',
        targetLabel: `${task.code}: ${task.title}`,
        category: NotificationCategory.COMMENT,
      });
    }

    return { ...comment, author: UsersService.toPublic(comment.author) };
  }

  async listComments(userId: number, taskId: number) {
    const task = await this.getTaskOrThrow(taskId);
    await this.organizationsService.assertMembership(
      task.organizationId,
      userId,
    );

    const comments = await this.prisma.taskComment.findMany({
      where: { taskId },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
    });
    return comments.map((comment) => ({
      ...comment,
      author: UsersService.toPublic(comment.author),
    }));
  }

  // Shared by create() and update() — both call this only when the
  // assignee has actually changed to someone other than the acting user
  // (never on unassign, never on a reassign-away notifying the old
  // assignee, never on self-assignment). Fires the in-app notification and
  // the email; an email failure is caught and swallowed here so it can
  // never roll back or fail the task mutation that already succeeded.
  private async notifyAssignment(params: {
    actorId: number;
    assigneeId: number;
    assigneeEmail: string;
    taskCode: string;
    taskTitle: string;
    taskDescription: string | null;
    projectName: string;
    dueDate: Date | null;
  }) {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { name: true },
    });

    await this.notificationsService.notify({
      recipientId: params.assigneeId,
      actorId: params.actorId,
      verb: 'assigned you to',
      targetLabel: `${params.taskCode}: ${params.taskTitle}`,
      category: NotificationCategory.ASSIGN,
      targetType: 'task',
      targetRef: params.taskCode,
    });

    try {
      await this.mailService.sendTaskAssignmentEmail({
        to: params.assigneeEmail,
        taskTitle: params.taskTitle,
        taskDescription: params.taskDescription,
        taskCode: params.taskCode,
        assignedByName: actor?.name ?? 'A teammate',
        projectName: params.projectName,
        dueDate: params.dueDate
          ? params.dueDate.toISOString().slice(0, 10)
          : null,
      });
    } catch {
      // MailService already logged the technical failure (see
      // MailService#send) — nothing further to do here except make sure it
      // never propagates and turns a successful assignment into a 500.
      this.logger.warn(
        `Task assignment email failed for task ${params.taskCode} — in-app notification was still created`,
      );
    }
  }

  private async getProjectOrThrow(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  private async getTaskOrThrow(taskId: number) {
    // Includes the project's name (not the full row) purely so update()
    // can build a task-assignment email without a second query — every
    // other caller of this helper (remove/addSubtask/etc.) just ignores
    // the extra field.
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { select: { name: true } } },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async getTaskWithIncludeOrThrow(
    taskId: number,
  ): Promise<TaskWithRelations> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: TASK_INCLUDE,
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async getSubtaskOrThrow(taskId: number, subtaskId: number) {
    const subtask = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
    });
    if (!subtask || subtask.taskId !== taskId) {
      throw new NotFoundException('Subtask not found');
    }
    return subtask;
  }

  private async nextTaskCode(organizationId: number): Promise<string> {
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { taskCounter: { increment: 1 } },
    });
    return `${organization.projectPrefix}-${organization.taskCounter}`;
  }

  // TASK_INCLUDE pulls in assignee/comments.author as full Prisma User rows
  // (passwordHash included) — never return one without going through this.
  private sanitize<T extends TaskWithRelations | TaskWithProject>(task: T) {
    return {
      ...task,
      assignee: task.assignee ? UsersService.toPublic(task.assignee) : null,
      comments: task.comments.map((comment) => ({
        ...comment,
        author: UsersService.toPublic(comment.author),
      })),
    };
  }
}
