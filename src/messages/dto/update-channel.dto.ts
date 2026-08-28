import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  // When provided, replaces the full member set (the requester is always
  // kept even if omitted — mirrors createChannel's behavior).
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  memberIds?: number[];
}
