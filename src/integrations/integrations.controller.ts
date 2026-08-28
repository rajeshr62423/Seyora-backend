import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { ConnectIntegrationDto } from './dto/connect-integration.dto';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @ResponseMessage('Integrations fetched successfully')
  @RequirePermission(Permission.INTEGRATION_VIEW)
  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.integrationsService.list(req.user.id);
  }

  @ResponseMessage('Integration connected successfully')
  @RequirePermission(Permission.INTEGRATION_CONNECT)
  @Post(':provider/connect')
  connect(
    @Req() req: Request & { user: RequestUser },
    @Param('provider') provider: string,
    @Body() dto: ConnectIntegrationDto,
  ) {
    return this.integrationsService.connect(req.user.id, provider, dto);
  }

  @ResponseMessage('Integration disconnected successfully')
  @RequirePermission(Permission.INTEGRATION_DISCONNECT)
  @Delete(':provider')
  disconnect(
    @Req() req: Request & { user: RequestUser },
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.disconnect(req.user.id, provider);
  }
}
