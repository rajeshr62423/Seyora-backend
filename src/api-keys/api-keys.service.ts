import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ApiKey } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';

const SALT_ROUNDS = 10;
type PublicApiKey = Omit<ApiKey, 'hashedKey'>;

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async create(userId: number, dto: CreateApiKeyDto) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    const hashedKey = await bcrypt.hash(rawKey, SALT_ROUNDS);
    const preview = `${rawKey.slice(0, 7)}...${rawKey.slice(-4)}`;

    const created = await this.prisma.apiKey.create({
      data: {
        organizationId: organization.id,
        name: dto.name,
        hashedKey,
        preview,
      },
    });

    // The only time the raw key is ever available — callers must copy it now.
    return { ...this.sanitize(created), key: rawKey };
  }

  async list(userId: number) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((key) => this.sanitize(key));
  }

  async revoke(userId: number, id: number) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.organizationId !== organization.id) {
      throw new NotFoundException('API key not found');
    }
    if (key.revokedAt) {
      throw new ConflictException('This API key has already been revoked');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return this.sanitize(updated);
  }

  private sanitize(key: ApiKey): PublicApiKey {
    const {
      id,
      organizationId,
      name,
      preview,
      lastUsedAt,
      revokedAt,
      createdAt,
    } = key;
    return {
      id,
      organizationId,
      name,
      preview,
      lastUsedAt,
      revokedAt,
      createdAt,
    };
  }
}
