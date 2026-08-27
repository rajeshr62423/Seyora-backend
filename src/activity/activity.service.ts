import { Injectable } from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { QueryActivityDto } from './dto/query-activity.dto';

export interface LogActivityInput {
  organizationId: number;
  actorId: number;
  action: string;
  targetType: string;
  targetId: number;
  targetLabel: string;
}

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  // Called from other services (ProjectsService, TasksService, ...) as a
  // side effect of the action itself — never exposed as a public endpoint.
  // Deliberately fire-and-forget from the caller's perspective: a logging
  // failure should never fail the action that triggered it, so callers
  // should call this without awaiting if they want that guarantee; kept
  // as a Promise here so callers that DO want to await still can.
  log(input: LogActivityInput) {
    return this.prisma.activityEntry.create({ data: input });
  }

  async findAll(userId: number, query: QueryActivityDto) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const [entries, total] = await Promise.all([
      this.prisma.activityEntry.findMany({
        where: {
          organizationId: organization.id,
          actorId: query.actorId,
          targetType: query.targetType,
          targetId: query.targetId,
        },
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activityEntry.count({
        where: {
          organizationId: organization.id,
          actorId: query.actorId,
          targetType: query.targetType,
          targetId: query.targetId,
        },
      }),
    ]);

    return {
      items: entries.map((entry) => ({
        ...entry,
        actor: UsersService.toPublic(entry.actor),
      })),
      page,
      pageSize,
      total,
    };
  }
}
