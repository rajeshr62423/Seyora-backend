import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesService } from './messages.service';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @ResponseMessage('Channels fetched successfully')
  @Get()
  findChannels(@Req() req: Request & { user: RequestUser }) {
    return this.messagesService.findChannels(req.user.id);
  }

  @ResponseMessage('Channel created successfully')
  @Post()
  createChannel(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateChannelDto,
  ) {
    return this.messagesService.createChannel(req.user.id, dto);
  }

  @ResponseMessage('Messages fetched successfully')
  @Get(':id/messages')
  findMessages(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.messagesService.findMessages(req.user.id, id);
  }

  @ResponseMessage('Message sent successfully')
  @Post(':id/messages')
  createMessage(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.createMessage(req.user.id, id, dto);
  }
}
