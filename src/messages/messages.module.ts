import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
