import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectSortKey, QueryProjectsDto } from './dto/query-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

// Round-robin brand palette, matching the frontend's mock project-color
// assignment (lib/data/projects.ts) closely enough for now.
const PROJECT_COLORS = [
  '#10B981',
  '#14B8A6',
  '#6366F1',
  '#F59E0B',
  '#EC4899',
  '#3B82F6',
];

const PROJECT_INCLUDE = {
  owner: true,
  members: { include: { user: true } },
} satisfies Prisma.ProjectInclude;

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: typeof PROJECT_INCLUDE;
}>;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    private readonly activityService: ActivityService,
  ) {}

  async findAll(userId: number, query: QueryProjectsDto) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);

    const projects = await this.prisma.project.findMany({
      where: {
        organizationId: organization.id,
        status: query.status,
        name: query.search
          ? { contains: query.search, mode: 'insensitive' }
          : undefined,
        members: query.memberId
          ? { some: { userId: query.memberId } }
          : undefined,
      },
      include: PROJECT_INCLUDE,
      orderBy: this.buildOrderBy(query.sort),
    });
    return projects.map((project) => this.sanitize(project));
  }

  async create(userId: number, input: CreateProjectDto) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    const slug = await this.generateUniqueSlug(organization.id, input.name);
    const color =
      PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];

    const memberIds = new Set(input.team);
    memberIds.add(userId); // the creator is always a member, even if omitted from `team`

    const project = await this.prisma.project.create({
      data: {
        organizationId: organization.id,
        ownerId: userId,
        name: input.name,
        description: input.description,
        status: input.status,
        dueDate: new Date(input.dueDate),
        color,
        slug,
        members: {
          create: Array.from(memberIds).map((id) => ({ userId: id })),
        },
      },
      include: PROJECT_INCLUDE,
    });

    await this.activityService.log({
      organizationId: organization.id,
      actorId: userId,
      action: 'created project',
      targetType: 'project',
      targetId: project.id,
      targetLabel: project.name,
    });

    return this.sanitize(project);
  }

  async findBySlug(userId: number, slug: string) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    const project = await this.prisma.project.findUnique({
      where: { organizationId_slug: { organizationId: organization.id, slug } },
      include: PROJECT_INCLUDE,
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.sanitize(project);
  }

  async update(userId: number, id: number, input: UpdateProjectDto) {
    const project = await this.assertOrganizationMembership(userId, id);

    const updated = await this.prisma.project.update({
      where: { id: project.id },
      data: {
        name: input.name,
        description: input.description,
        status: input.status,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
      include: PROJECT_INCLUDE,
    });

    if (input.status && input.status !== project.status) {
      await this.activityService.log({
        organizationId: project.organizationId,
        actorId: userId,
        action: `changed status to ${input.status}`,
        targetType: 'project',
        targetId: project.id,
        targetLabel: updated.name,
      });
    }

    return this.sanitize(updated);
  }

  // PROJECT_INCLUDE pulls in owner/members.user as full Prisma User rows
  // (passwordHash included) — never return one of those to a client without
  // going through this first.
  private sanitize(project: ProjectWithRelations) {
    return {
      ...project,
      owner: UsersService.toPublic(project.owner),
      members: project.members.map((member) => ({
        ...member,
        user: UsersService.toPublic(member.user),
      })),
    };
  }

  // No granular per-project role exists yet — any member of the project's
  // organization may view/edit it, matching the frontend's current lack of
  // per-project permission UI.
  private async assertOrganizationMembership(
    userId: number,
    projectId: number,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.organizationsService.assertMembership(
      project.organizationId,
      userId,
    );

    return project;
  }

  private buildOrderBy(
    sort?: ProjectSortKey,
  ): Prisma.ProjectOrderByWithRelationInput {
    switch (sort) {
      case 'name':
        return { name: 'asc' };
      case 'dueDate':
        return { dueDate: 'asc' };
      default:
        return { updatedAt: 'desc' };
    }
  }

  private async generateUniqueSlug(
    organizationId: number,
    name: string,
  ): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let suffix = 1;
    while (
      await this.prisma.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: candidate } },
      })
    ) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }
}
