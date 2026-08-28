import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ActivityService } from './activity.service';
import { QueryActivityDto } from './dto/query-activity.dto';

@Controller('activity')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @ResponseMessage('Activity fetched successfully')
  @RequirePermission(Permission.ACTIVITY_VIEW)
  @Get()
  findAll(
    @Req() req: Request & { user: RequestUser },
    @Query() query: QueryActivityDto,
  ) {
    return this.activityService.findAll(req.user.id, query);
  }
}
