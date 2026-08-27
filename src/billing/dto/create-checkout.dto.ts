import { IsIn } from 'class-validator';
import { PAID_PLAN_KEYS } from '../plans';

export class CreateCheckoutDto {
  @IsIn(PAID_PLAN_KEYS)
  planKey: string;
}
