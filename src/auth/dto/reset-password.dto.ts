import { IsString, MinLength } from 'class-validator';
import { Match } from '../../common/validators/match.decorator';

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @Match('password', { message: 'confirmPassword must match password' })
  confirmPassword: string;
}
