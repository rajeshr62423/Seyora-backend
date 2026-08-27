import { TaskPriority, TaskStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  // undefined = leave unchanged, null = unassign, number = reassign
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  assigneeId?: number | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
