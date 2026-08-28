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
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @ResponseMessage('Webhooks fetched successfully')
  @RequirePermission(Permission.WEBHOOK_VIEW)
  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.webhooksService.list(req.user.id);
  }

  @ResponseMessage('Webhook created successfully')
  @RequirePermission(Permission.WEBHOOK_CREATE)
  @Post()
  create(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooksService.create(req.user.id, dto);
  }

  @ResponseMessage('Webhook deleted successfully')
  @RequirePermission(Permission.WEBHOOK_DELETE)
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
  @RequirePermission(Permission.WEBHOOK_TEST)
  @HttpCode(HttpStatus.OK)
  @Post(':id/test')
  test(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.webhooksService.test(req.user.id, id);
  }
}
