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
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ConnectIntegrationDto } from './dto/connect-integration.dto';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @ResponseMessage('Integrations fetched successfully')
  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.integrationsService.list(req.user.id);
  }

  @ResponseMessage('Integration connected successfully')
  @Post(':provider/connect')
  connect(
    @Req() req: Request & { user: RequestUser },
    @Param('provider') provider: string,
    @Body() dto: ConnectIntegrationDto,
  ) {
    return this.integrationsService.connect(req.user.id, provider, dto);
  }

  @ResponseMessage('Integration disconnected successfully')
  @Delete(':provider')
  disconnect(
    @Req() req: Request & { user: RequestUser },
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.disconnect(req.user.id, provider);
  }
}
