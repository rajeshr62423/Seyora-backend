import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { OrganizationsService } from './organizations.service';

// Deliberately outside /organizations/* — the accepting user isn't a
// member of the target org yet, so this can't be scoped under 'me'.
@Controller('invitations')
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @ResponseMessage('Invitation accepted successfully')
  @Post(':token/accept')
  accept(
    @Req() req: Request & { user: RequestUser },
    @Param('token') token: string,
  ) {
    return this.organizationsService.acceptInvitation(req.user.id, token);
  }
}
