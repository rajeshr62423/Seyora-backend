import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
