import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @ResponseMessage('Plans fetched successfully')
  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @ResponseMessage('Subscription fetched successfully')
  @Get('subscription')
  getSubscription(@Req() req: Request & { user: RequestUser }) {
    return this.billingService.getSubscription(req.user.id);
  }

  @ResponseMessage('Checkout created successfully')
  @Post('checkout')
  createCheckout(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(req.user.id, dto);
  }

  @ResponseMessage('Payment verified successfully')
  @Post('verify')
  verifyPayment(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.billingService.verifyPayment(req.user.id, dto);
  }

  @ResponseMessage('Subscription canceled successfully')
  @Post('cancel')
  cancelSubscription(@Req() req: Request & { user: RequestUser }) {
    return this.billingService.cancelSubscription(req.user.id);
  }
}
