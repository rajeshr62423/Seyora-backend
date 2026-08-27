import { BadRequestException, Injectable } from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ConnectIntegrationDto } from './dto/connect-integration.dto';
import { isKnownProvider, KNOWN_PROVIDERS } from './providers';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async list(userId: number) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertMembership(organization.id, userId);

    const rows = await this.prisma.integration.findMany({
      where: { organizationId: organization.id },
    });
    const byProvider = new Map(rows.map((row) => [row.provider, row]));

    return KNOWN_PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);
      return {
        provider,
        status: row ? 'connected' : 'disconnected',
        label: row?.label ?? null,
        connectedAt: row?.connectedAt ?? null,
      };
    });
  }

  async connect(userId: number, provider: string, dto: ConnectIntegrationDto) {
    if (!isKnownProvider(provider)) {
      throw new BadRequestException(
        `Unknown integration provider: ${provider}`,
      );
    }
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    const row = await this.prisma.integration.upsert({
      where: {
        organizationId_provider: { organizationId: organization.id, provider },
      },
      create: {
        organizationId: organization.id,
        provider,
        label: dto.label,
        connectedAt: new Date(),
      },
      update: { label: dto.label, connectedAt: new Date() },
    });

    return {
      provider: row.provider,
      status: 'connected',
      label: row.label,
      connectedAt: row.connectedAt,
    };
  }

  async disconnect(userId: number, provider: string) {
    if (!isKnownProvider(provider)) {
      throw new BadRequestException(
        `Unknown integration provider: ${provider}`,
      );
    }
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    await this.prisma.integration.deleteMany({
      where: { organizationId: organization.id, provider },
    });

    return { provider, status: 'disconnected', label: null, connectedAt: null };
  }
}
