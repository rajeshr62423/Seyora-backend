import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { MessagesService } from './messages.service';

@Controller('channels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @ResponseMessage('Channels fetched successfully')
  @RequirePermission(Permission.MESSAGE_VIEW)
  @Get()
  findChannels(@Req() req: Request & { user: RequestUser }) {
    return this.messagesService.findChannels(req.user.id);
  }

  // Channel creation/management is a write action gated by MESSAGE_CREATE
  // (no dedicated CHANNEL_* permission exists) — this is what keeps VIEWER
  // (MESSAGE_VIEW only) from creating/renaming channels while still being
  // able to read them.
  @ResponseMessage('Channel created successfully')
  @RequirePermission(Permission.MESSAGE_CREATE)
  @Post()
  createChannel(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateChannelDto,
  ) {
    return this.messagesService.createChannel(req.user.id, dto);
  }

  @ResponseMessage('Channel updated successfully')
  @RequirePermission(Permission.MESSAGE_CREATE)
  @Patch(':id')
  updateChannel(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.messagesService.updateChannel(req.user.id, id, dto);
  }

  @ResponseMessage('Messages fetched successfully')
  @RequirePermission(Permission.MESSAGE_VIEW)
  @Get(':id/messages')
  findMessages(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.messagesService.findMessages(req.user.id, id);
  }

  @ResponseMessage('Message sent successfully')
  @RequirePermission(Permission.MESSAGE_CREATE)
  @Post(':id/messages')
  createMessage(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.createMessage(req.user.id, id, dto);
  }
}
