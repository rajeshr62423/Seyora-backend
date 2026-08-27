import { OrgRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsEnum(OrgRole)
  role: OrgRole;
}
