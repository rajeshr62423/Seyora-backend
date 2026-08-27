import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @ResponseMessage('Webhooks fetched successfully')
  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.webhooksService.list(req.user.id);
  }

  @ResponseMessage('Webhook created successfully')
  @Post()
  create(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooksService.create(req.user.id, dto);
  }

  @ResponseMessage('Webhook deleted successfully')
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async delete(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.webhooksService.delete(req.user.id, id);
    return null;
  }

  @ResponseMessage('Test delivery attempted')
  @HttpCode(HttpStatus.OK)
  @Post(':id/test')
  test(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.webhooksService.test(req.user.id, id);
  }
}
