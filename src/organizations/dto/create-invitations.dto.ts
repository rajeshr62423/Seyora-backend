import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { OrgRole } from '@prisma/client';

class InviteEntryDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(OrgRole)
  role?: OrgRole;
}

export class CreateInvitationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InviteEntryDto)
  invites: InviteEntryDto[];
}
