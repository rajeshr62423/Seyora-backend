import { ProjectStatus } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ProjectStatus)
  status: ProjectStatus;

  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  team: number[];

  @IsDateString()
  dueDate: string;
}
