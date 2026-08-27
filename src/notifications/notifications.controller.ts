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
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ResponseMessage('Notifications fetched successfully')
  @Get()
  findAll(@Req() req: Request & { user: RequestUser }) {
    return this.notificationsService.findAll(req.user.id);
  }

  // Must come before ':id' below, or "read-all" would be parsed as an id.
  @ResponseMessage('All notifications marked as read')
  @Patch('read-all')
  markAllRead(@Req() req: Request & { user: RequestUser }) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @ResponseMessage('Notification marked as read')
  @Patch(':id')
  markRead(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notificationsService.markRead(req.user.id, id);
  }
}
