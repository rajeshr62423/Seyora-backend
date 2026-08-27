import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly notificationPreferencesService: NotificationPreferencesService,
  ) {}

  @ResponseMessage('Users fetched successfully')
  @Get()
  async findAll(@Query('search') search?: string) {
    const users = await this.usersService.findAll(search);
    return users.map((user) => UsersService.toPublic(user));
  }

  @ResponseMessage('Profile updated successfully')
  @Patch('me')
  async updateMe(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: UpdateUserDto,
  ) {
    const updated = await this.usersService.update(req.user.id, dto);
    return UsersService.toPublic(updated);
  }

  @ResponseMessage('Notification preferences fetched successfully')
  @Get('me/notification-preferences')
  getNotificationPreferences(@Req() req: Request & { user: RequestUser }) {
    return this.notificationPreferencesService.findOrCreate(req.user.id);
  }

  @ResponseMessage('Notification preferences updated successfully')
  @Patch('me/notification-preferences')
  updateNotificationPreferences(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationPreferencesService.update(req.user.id, dto);
  }

  @ResponseMessage('User fetched successfully')
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return UsersService.toPublic(user);
  }
}
