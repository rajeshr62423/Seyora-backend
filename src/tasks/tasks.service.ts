import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationCategory, Prisma, TaskStatus } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    private readonly activityService: ActivityService,
    private readonly notificationsService: NotificationsService,
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

    if (input.assigneeId !== undefined && input.assigneeId !== userId) {
      await this.notificationsService.notify({
        recipientId: input.assigneeId,
        actorId: userId,
        verb: 'assigned you to',
        targetLabel: `${task.code}: ${task.title}`,
        category: NotificationCategory.ASSIGN,
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

  async update(userId: number, taskId: number, input: UpdateTaskDto) {
    const task = await this.getTaskOrThrow(taskId);
    await this.organizationsService.assertMembership(
      task.organizationId,
      userId,
    );
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
        action: `moved task to ${input.status}`,
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
        action: 'reassigned task',
        targetType: 'task',
        targetId: task.id,
        targetLabel: `${task.code}: ${updated.title}`,
      });
      if (newAssigneeId !== userId) {
        await this.notificationsService.notify({
          recipientId: newAssigneeId,
          actorId: userId,
          verb: 'assigned you to',
          targetLabel: `${task.code}: ${updated.title}`,
          category: NotificationCategory.ASSIGN,
        });
      }
    }

    return this.sanitize(updated);
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
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
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
