import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

  update(id: number, input: UpdateUserDto) {
    return this.prisma.user.update({ where: { id }, data: input });
  }

  updatePasswordHash(id: number, passwordHash: string) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  // Never return passwordHash to a client — every controller response that
  // includes a User must go through this first. Listing fields explicitly
  // (rather than destructuring passwordHash away and discarding it) keeps
  // this lint-clean and still type-checked against PublicUser.
  static toPublic(user: User): PublicUser {
    const { id, name, email, role, createdAt, updatedAt } = user;
    return { id, name, email, role, createdAt, updatedAt };
  }
}
