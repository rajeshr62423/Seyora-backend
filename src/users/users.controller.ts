import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  type OrgContext,
} from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { imageUploadOptions } from '../uploads/upload.utils';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly notificationPreferencesService: NotificationPreferencesService,
  ) {}

  // Org-scoped (findAllInOrganization) — GET /users used to return every
  // user on the platform regardless of organization, a real cross-tenant
  // leak. request.orgContext is set by PermissionsGuard, which already
  // resolved the caller's current organization for the MEMBER_VIEW check
  // below, so no second lookup is needed here.
  @ResponseMessage('Users fetched successfully')
  @RequirePermission(Permission.MEMBER_VIEW)
  @Get()
  async findAll(
    @Req() req: Request & { orgContext: OrgContext },
    @Query('search') search?: string,
  ) {
    const users = await this.usersService.findAllInOrganization(
      req.orgContext.organizationId,
      search,
    );
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

  @ResponseMessage('Avatar updated successfully')
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('avatars')))
  async uploadAvatar(
    @Req() req: Request & { user: RequestUser },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const updated = await this.usersService.setAvatar(req.user.id, file);
    return UsersService.toPublic(updated);
  }

  @ResponseMessage('Avatar removed successfully')
  @Delete('me/avatar')
  async removeAvatar(@Req() req: Request & { user: RequestUser }) {
    const updated = await this.usersService.setAvatar(req.user.id, null);
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
  @RequirePermission(Permission.MEMBER_VIEW)
  @Get(':id')
  async findOne(
    @Req() req: Request & { orgContext: OrgContext },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = await this.usersService.findByIdInOrganization(
      req.orgContext.organizationId,
      id,
    );
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return UsersService.toPublic(user);
  }
}
