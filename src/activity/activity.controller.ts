import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ActivityService } from './activity.service';
import { QueryActivityDto } from './dto/query-activity.dto';

@Controller('activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @ResponseMessage('Activity fetched successfully')
  @Get()
  findAll(
    @Req() req: Request & { user: RequestUser },
    @Query() query: QueryActivityDto,
  ) {
    return this.activityService.findAll(req.user.id, query);
  }
}
