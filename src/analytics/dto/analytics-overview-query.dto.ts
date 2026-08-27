import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export class AnalyticsOverviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30, 90])
  range: number = 30;
}
