import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { MailModule } from '../common/mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    OrganizationsModule,
    ActivityModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
