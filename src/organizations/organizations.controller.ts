import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { imageUploadOptions } from '../uploads/upload.utils';
import { CreateInvitationsDto } from './dto/create-invitations.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { QueryMembersDto } from './dto/query-members.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // No org exists yet at creation time, so there's nothing to check
  // membership/permissions against.
  @ResponseMessage('Organization created successfully')
  @Post()
  create(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(req.user.id, dto);
  }

  // Ungated beyond authentication — reading your own org needs no
  // elevated permission, and this is also where the frontend learns the
  // caller's role/permissions (see getCurrentForUserWithAccess).
  @ResponseMessage('Organization fetched successfully')
  @Get('me')
  getMine(@Req() req: Request & { user: RequestUser }) {
    return this.organizationsService.getCurrentForUserWithAccess(req.user.id);
  }

  @ResponseMessage('Organization updated successfully')
  @RequirePermission(Permission.ORG_UPDATE)
  @Patch('me')
  updateMine(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.updateCurrentForUser(req.user.id, dto);
  }

  @ResponseMessage('Logo updated successfully')
  @RequirePermission(Permission.ORG_UPDATE)
  @Post('me/logo')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('logos')))
  uploadLogo(
    @Req() req: Request & { user: RequestUser },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.organizationsService.setLogo(req.user.id, file);
  }

  @ResponseMessage('Logo removed successfully')
  @RequirePermission(Permission.ORG_UPDATE)
  @Delete('me/logo')
  removeLogo(@Req() req: Request & { user: RequestUser }) {
    return this.organizationsService.setLogo(req.user.id, null);
  }

  @ResponseMessage('Members fetched successfully')
  @RequirePermission(Permission.MEMBER_VIEW)
  @Get('me/members')
  listMembers(
    @Req() req: Request & { user: RequestUser },
    @Query() query: QueryMembersDto,
  ) {
    return this.organizationsService.listMembers(req.user.id, query);
  }

  @ResponseMessage('Member role updated successfully')
  @RequirePermission(Permission.MEMBER_UPDATE)
  @Patch('me/members/:userId/role')
  updateMemberRole(
    @Req() req: Request & { user: RequestUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(req.user.id, userId, dto);
  }

  @ResponseMessage('Invitations sent successfully')
  @RequirePermission(Permission.MEMBER_INVITE)
  @Post('me/invitations')
  createInvitations(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateInvitationsDto,
  ) {
    return this.organizationsService.createInvitations(req.user.id, dto);
  }

  @ResponseMessage('Invitations fetched successfully')
  @RequirePermission(Permission.MEMBER_INVITE)
  @Get('me/invitations')
  listInvitations(@Req() req: Request & { user: RequestUser }) {
    return this.organizationsService.listInvitations(req.user.id);
  }

  @ResponseMessage('Invitation revoked successfully')
  @RequirePermission(Permission.MEMBER_INVITE)
  @Delete('me/invitations/:id')
  revokeInvitation(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationsService.revokeInvitation(req.user.id, id);
  }
}
