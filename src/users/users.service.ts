import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { deleteUploadedFile, toPublicUploadUrl } from '../uploads/upload.utils';
import type { UpdateUserDto } from './dto/update-user.dto';

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: CreateUserInput) {
    return this.prisma.user.create({ data: input });
  }

  // Unscoped — queries every user on the platform regardless of
  // organization. Kept as-is (not removed) since nothing currently calls
  // it: the frontend was migrated onto the org-scoped
  // GET /organizations/me/members earlier, and the controller route now
  // calls findAllInOrganization below instead.
  findAll(search?: string) {
    return this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
    });
  }

  // Org-scoped replacement for findAll — only returns users who share an
  // OrganizationMember row with the caller's organization, closing the
  // cross-tenant leak GET /users had (any authenticated user could
  // previously enumerate every user on the platform, not just their own
  // org). Same search behavior (name/email, case-insensitive) as before.
  findAllInOrganization(organizationId: number, search?: string) {
    return this.prisma.user.findMany({
      where: {
        organizations: { some: { organizationId } },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  // Org-scoped replacement for findById — same NotFoundException-on-miss
  // behavior the controller already had, now also treating "exists but in
  // a different organization" as not found rather than leaking it.
  findByIdInOrganization(organizationId: number, id: number) {
    return this.prisma.user.findFirst({
      where: { id, organizations: { some: { organizationId } } },
    });
  }

  update(id: number, input: UpdateUserDto) {
    return this.prisma.user.update({ where: { id }, data: input });
  }

  // file === null removes the current avatar. Either way, the previous
  // file (if any) is deleted from disk after the DB row is updated, so a
  // failed delete never leaves the row pointing at a URL that's already
  // gone — just an orphaned file, which is the safer failure direction.
  async setAvatar(id: number, file: Express.Multer.File | null) {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.user.update({
      where: { id },
      data: { avatarUrl: file ? toPublicUploadUrl(file) : null },
    });
    await deleteUploadedFile(current.avatarUrl);
    return updated;
  }

  updatePasswordHash(id: number, passwordHash: string) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  // Never return passwordHash to a client — every controller response that
  // includes a User must go through this first. Listing fields explicitly
  // (rather than destructuring passwordHash away and discarding it) keeps
  // this lint-clean and still type-checked against PublicUser.
  static toPublic(user: User): PublicUser {
    const { id, name, email, role, avatarUrl, createdAt, updatedAt } = user;
    return { id, name, email, role, avatarUrl, createdAt, updatedAt };
  }
}
