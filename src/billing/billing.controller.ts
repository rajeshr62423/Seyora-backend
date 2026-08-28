import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // Static global plan data, not org data — no permission needed beyond
  // authentication, matches today.
  @ResponseMessage('Plans fetched successfully')
  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @ResponseMessage('Subscription fetched successfully')
  @RequirePermission(Permission.BILLING_VIEW)
  @Get('subscription')
  getSubscription(@Req() req: Request & { user: RequestUser }) {
    return this.billingService.getSubscription(req.user.id);
  }

  @ResponseMessage('Checkout created successfully')
  @RequirePermission(Permission.BILLING_MANAGE)
  @Post('checkout')
  createCheckout(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(req.user.id, dto);
  }

  @ResponseMessage('Payment verified successfully')
  @RequirePermission(Permission.BILLING_MANAGE)
  @Post('verify')
  verifyPayment(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.billingService.verifyPayment(req.user.id, dto);
  }

  @ResponseMessage('Subscription canceled successfully')
  @RequirePermission(Permission.BILLING_MANAGE)
  @Post('cancel')
  cancelSubscription(@Req() req: Request & { user: RequestUser }) {
    return this.billingService.cancelSubscription(req.user.id);
  }
}
