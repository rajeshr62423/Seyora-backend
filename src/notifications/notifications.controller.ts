import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { NotificationsService } from './notifications.service';

// Every role has both NOTIFICATION_VIEW/NOTIFICATION_UPDATE, so this
// permission gate is additive, not a behavior change — notifications stay
// scoped by recipientId === userId at the service layer, same as today.
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ResponseMessage('Notifications fetched successfully')
  @RequirePermission(Permission.NOTIFICATION_VIEW)
  @Get()
  findAll(@Req() req: Request & { user: RequestUser }) {
    return this.notificationsService.findAll(req.user.id);
  }

  // Must come before ':id' below, or "read-all" would be parsed as an id.
  @ResponseMessage('All notifications marked as read')
  @RequirePermission(Permission.NOTIFICATION_UPDATE)
  @Patch('read-all')
  markAllRead(@Req() req: Request & { user: RequestUser }) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @ResponseMessage('Notification marked as read')
  @RequirePermission(Permission.NOTIFICATION_UPDATE)
  @Patch(':id')
  markRead(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notificationsService.markRead(req.user.id, id);
  }
}
