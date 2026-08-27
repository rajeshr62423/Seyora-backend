import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{2,10}$/, {
    message: 'projectPrefix must be 2-10 uppercase letters/numbers',
  })
  projectPrefix?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
