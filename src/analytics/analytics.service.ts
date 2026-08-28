import { Injectable } from '@nestjs/common';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { getInitials } from '../common/utils/initials';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsOverviewQueryDto } from './dto/analytics-overview-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async overview(userId: number, query: AnalyticsOverviewQueryDto) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertMembership(organization.id, userId);

    const now = new Date();
    const windowStart = new Date(now.getTime() - query.range * DAY_MS);

    const [
      totalTasks,
      doneTasks,
      overdueCount,
      statusGroups,
      priorityGroups,
      completedInWindow,
    ] = await Promise.all([
      this.prisma.task.count({ where: { organizationId: organization.id } }),
      this.prisma.task.count({
        where: { organizationId: organization.id, status: TaskStatus.DONE },
      }),
      this.prisma.task.count({
        where: {
          organizationId: organization.id,
          status: { not: TaskStatus.DONE },
          dueDate: { lt: now },
        },
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { organizationId: organization.id },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['priority'],
        where: { organizationId: organization.id },
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: organization.id,
          completedAt: { gte: windowStart },
        },
        select: { completedAt: true },
      }),
    ]);

    return {
      range: query.range,
      completionRate: totalTasks
        ? Math.round((doneTasks / totalTasks) * 100)
        : 0,
      overdueCount,
      tasksByStatus: this.tallyByKey(
        Object.values(TaskStatus),
        statusGroups,
        'status',
      ),
      tasksByPriority: this.tallyByKey(
        Object.values(TaskPriority),
        priorityGroups,
        'priority',
      ),
      completionTrend: this.buildTrend(windowStart, now, completedInWindow),
    };
  }

  async teamPerformance(userId: number) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertMembership(organization.id, userId);

    const [members, taskGroups] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { organizationId: organization.id },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId', 'status'],
        where: { organizationId: organization.id, assigneeId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const statsByAssignee = new Map<
      number,
      { assigned: number; completed: number }
    >();
    for (const group of taskGroups) {
      if (group.assigneeId === null) continue;
      const entry = statsByAssignee.get(group.assigneeId) ?? {
        assigned: 0,
        completed: 0,
      };
      entry.assigned += group._count._all;
      if (group.status === TaskStatus.DONE) {
        entry.completed += group._count._all;
      }
      statsByAssignee.set(group.assigneeId, entry);
    }

    return members.map(({ user }) => {
      const stats = statsByAssignee.get(user.id) ?? {
        assigned: 0,
        completed: 0,
      };
      return {
        userId: user.id,
        name: user.name,
        initials: getInitials(user.name),
        avatarUrl: user.avatarUrl,
        assigned: stats.assigned,
        completed: stats.completed,
        openTasks: stats.assigned - stats.completed,
        completionRate: stats.assigned
          ? Math.round((stats.completed / stats.assigned) * 100)
          : 0,
      };
    });
  }

  private tallyByKey<K extends string>(
    keys: K[],
    groups: Array<{ _count: { _all: number } } & Record<string, unknown>>,
    field: string,
  ): Record<K, number> {
    const tally = Object.fromEntries(keys.map((key) => [key, 0])) as Record<
      K,
      number
    >;
    for (const group of groups) {
      const key = group[field] as K;
      tally[key] = group._count._all;
    }
    return tally;
  }

  private buildTrend(
    windowStart: Date,
    now: Date,
    completed: Array<{ completedAt: Date | null }>,
  ): Array<{ date: string; completed: number }> {
    const counts = new Map<string, number>();
    for (const { completedAt } of completed) {
      if (!completedAt) continue;
      const key = completedAt.toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const days: Array<{ date: string; completed: number }> = [];
    const cursor = new Date(windowStart);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setUTCHours(0, 0, 0, 0);

    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      days.push({ date: key, completed: counts.get(key) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }
}
