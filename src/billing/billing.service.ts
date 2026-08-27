import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import Razorpay from 'razorpay';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCheckoutDto } from './dto/create-checkout.dto';
import type { VerifyPaymentDto } from './dto/verify-payment.dto';
import { findPlan, PLANS } from './plans';

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — see Subscription model comment

@Injectable()
export class BillingService {
  private readonly razorpay: Razorpay;
  private readonly secretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    private readonly configService: ConfigService,
  ) {
    const key_id = this.configService.get<string>('RAZOR_KEY_ID')!;
    this.secretKey = this.configService.get<string>('RAZOR_SECRET_KEY')!;
    this.razorpay = new Razorpay({ key_id, key_secret: this.secretKey });
  }

  getPlans() {
    return PLANS;
  }

  async getSubscription(userId: number) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertMembership(organization.id, userId);

    const [subscription, memberCount, projectCount] = await Promise.all([
      this.findOrCreateSubscription(organization.id),
      this.prisma.organizationMember.count({
        where: { organizationId: organization.id },
      }),
      this.prisma.project.count({ where: { organizationId: organization.id } }),
    ]);

    return {
      ...subscription,
      plan: findPlan(subscription.planKey),
      usage: { members: memberCount, projects: projectCount },
    };
  }

  async createCheckout(userId: number, dto: CreateCheckoutDto) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    const plan = findPlan(dto.planKey);
    if (!plan) {
      throw new BadRequestException('Unknown plan');
    }

    const order = await this.razorpay.orders.create({
      amount: plan.priceInPaise,
      currency: 'INR',
      receipt: `org_${organization.id}_${Date.now()}`,
      notes: { organizationId: String(organization.id), planKey: plan.key },
    });

    await this.prisma.payment.create({
      data: {
        organizationId: organization.id,
        planKey: plan.key,
        amountInPaise: plan.priceInPaise,
        razorpayOrderId: order.id,
        status: 'created',
      },
    });

    return {
      orderId: order.id,
      amount: plan.priceInPaise,
      currency: 'INR',
      keyId: this.configService.get<string>('RAZOR_KEY_ID'),
      planKey: plan.key,
    };
  }

  async verifyPayment(userId: number, dto: VerifyPaymentDto) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    const payment = await this.prisma.payment.findUnique({
      where: { razorpayOrderId: dto.razorpayOrderId },
    });
    if (!payment || payment.organizationId !== organization.id) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.status === 'paid') {
      throw new ConflictException('This payment has already been verified');
    }

    const expectedSignature = createHmac('sha256', this.secretKey)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');
    if (expectedSignature !== dto.razorpaySignature) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      });
      throw new BadRequestException('Payment signature verification failed');
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'paid', razorpayPaymentId: dto.razorpayPaymentId },
    });

    return this.prisma.subscription.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        planKey: payment.planKey,
        currentPeriodEnd: new Date(Date.now() + PERIOD_MS),
      },
      update: {
        planKey: payment.planKey,
        currentPeriodEnd: new Date(Date.now() + PERIOD_MS),
      },
    });
  }

  async cancelSubscription(userId: number) {
    const organization =
      await this.organizationsService.getCurrentForUser(userId);
    await this.organizationsService.assertAdmin(organization.id, userId);

    await this.findOrCreateSubscription(organization.id);
    return this.prisma.subscription.update({
      where: { organizationId: organization.id },
      data: { planKey: 'free', currentPeriodEnd: null },
    });
  }

  private async findOrCreateSubscription(organizationId: number) {
    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.subscription.create({ data: { organizationId } });
  }
}
