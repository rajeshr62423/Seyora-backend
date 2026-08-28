import {
  Body,
  Controller,
  Delete,
  Get,
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
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @ResponseMessage('API keys fetched successfully')
  @RequirePermission(Permission.API_KEY_VIEW)
  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.apiKeysService.list(req.user.id);
  }

  @ResponseMessage('API key created successfully')
  @RequirePermission(Permission.API_KEY_CREATE)
  @Post()
  create(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(req.user.id, dto);
  }

  @ResponseMessage('API key revoked successfully')
  @RequirePermission(Permission.API_KEY_DELETE)
  @Delete(':id')
  revoke(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.apiKeysService.revoke(req.user.id, id);
  }
}
