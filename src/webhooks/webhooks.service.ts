import { Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateWebhookDto } from './dto/create-webhook.dto';

const TEST_DELIVERY_TIMEOUT_MS = 5000;

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async create(userId: number, dto: CreateWebhookDto) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    return this.prisma.webhook.create({
      data: {
        organizationId: organization.id,
        url: dto.url,
        events: dto.events,
        secret: `whsec_${randomBytes(24).toString('hex')}`,
      },
    });
  }

  async list(userId: number) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    return this.prisma.webhook.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(userId: number, id: number) {
    const webhook = await this.findOwned(userId, id);
    await this.prisma.webhook.delete({ where: { id: webhook.id } });
  }

  // MVP scope: fires one real HTTP request with a fake payload so the "test"
  // button gives honest reachability feedback. Delivering payloads on real
  // events (retries, delivery log) is a separate, bigger feature — see
  // PLANNING.md Phase 6.
  async test(userId: number, id: number) {
    const webhook = await this.findOwned(userId, id);

    const payload = JSON.stringify({
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery from Seyora' },
    });
    const signature = createHmac('sha256', webhook.secret)
      .update(payload)
      .digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TEST_DELIVERY_TIMEOUT_MS,
    );

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Seyora-Signature': signature,
        },
        body: payload,
        signal: controller.signal,
      });
      await this.prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastDeliveryAt: new Date() },
      });
      return { success: response.ok, statusCode: response.status };
    } catch (error) {
      await this.prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastDeliveryAt: new Date() },
      });
      const message =
        error instanceof Error ? error.message : 'Delivery failed';
      return { success: false, statusCode: null, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async findOwned(userId: number, id: number) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    const webhook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!webhook || webhook.organizationId !== organization.id) {
      throw new NotFoundException('Webhook not found');
    }
    return webhook;
  }
}
