import {
  Body,
  Controller,
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
import { RegisterViaInvitationDto } from './dto/register-via-invitation.dto';
import { OrganizationsService } from './organizations.service';

// Deliberately outside /organizations/* — the accepting user isn't a
// member of the target org yet, so this can't be scoped under 'me'.
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // Public, unauthenticated — the frontend's /invitations/accept page calls
  // this first to render "You're invited to join {org} as {role}" before
  // the visitor has logged in, registered, or done anything else.
  @ResponseMessage('Invitation fetched successfully')
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.organizationsService.getInvitationPreview(token);
  }

  // Requires an existing, authenticated account — the invited email
  // already has one, so the user logs in first (existing JWT flow), then
  // hits this to join. See `register` below for the no-account-yet case.
  @ResponseMessage('Invitation accepted successfully')
  @UseGuards(JwtAuthGuard)
  @Post(':token/accept')
  accept(
    @Req() req: Request & { user: RequestUser },
    @Param('token') token: string,
  ) {
    return this.organizationsService.acceptInvitation(req.user.id, token);
  }

  // Deliberately unauthenticated — the invited email has no account yet,
  // so there's no JWT to present. Creates the account (using the
  // invitation's own email, never a client-supplied one) and signs it in.
  @ResponseMessage('Account created and invitation accepted successfully')
  @Post(':token/register')
  register(
    @Param('token') token: string,
    @Body() dto: RegisterViaInvitationDto,
  ) {
    return this.organizationsService.registerViaInvitation(token, dto);
  }
}
