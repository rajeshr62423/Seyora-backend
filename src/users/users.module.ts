import { Module } from '@nestjs/common';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, NotificationPreferencesService],
  exports: [UsersService],
})
export class UsersModule {}
