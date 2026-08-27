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
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CreateInvitationsDto } from './dto/create-invitations.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @ResponseMessage('Organization created successfully')
  @Post()
  create(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(req.user.id, dto);
  }

  @ResponseMessage('Organization fetched successfully')
  @Get('me')
  getMine(@Req() req: Request & { user: RequestUser }) {
    return this.organizationsService.getCurrentForUser(req.user.id);
  }

  @ResponseMessage('Organization updated successfully')
  @Patch('me')
  updateMine(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.updateCurrentForUser(req.user.id, dto);
  }

  @ResponseMessage('Members fetched successfully')
  @Get('me/members')
  listMembers(@Req() req: Request & { user: RequestUser }) {
    return this.organizationsService.listMembers(req.user.id);
  }

  @ResponseMessage('Member role updated successfully')
  @Patch('me/members/:userId/role')
  updateMemberRole(
    @Req() req: Request & { user: RequestUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(req.user.id, userId, dto);
  }

  @ResponseMessage('Invitations sent successfully')
  @Post('me/invitations')
  createInvitations(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateInvitationsDto,
  ) {
    return this.organizationsService.createInvitations(req.user.id, dto);
  }

  @ResponseMessage('Invitations fetched successfully')
  @Get('me/invitations')
  listInvitations(@Req() req: Request & { user: RequestUser }) {
    return this.organizationsService.listInvitations(req.user.id);
  }
}
