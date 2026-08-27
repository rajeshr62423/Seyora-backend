import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsOverviewQueryDto } from './dto/analytics-overview-query.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @ResponseMessage('Analytics overview fetched successfully')
  @Get('overview')
  overview(
    @Req() req: Request & { user: RequestUser },
    @Query() query: AnalyticsOverviewQueryDto,
  ) {
    return this.analyticsService.overview(req.user.id, query);
  }

  @ResponseMessage('Team performance fetched successfully')
  @Get('team-performance')
  teamPerformance(@Req() req: Request & { user: RequestUser }) {
    return this.analyticsService.teamPerformance(req.user.id);
  }
}
