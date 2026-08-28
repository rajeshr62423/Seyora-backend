import { IsString, MinLength } from 'class-validator';
import { Match } from '../../common/validators/match.decorator';

// Used only when the invited email has no existing account yet (see
// OrganizationsService.registerViaInvitation). The invitation's own email
// is always used for the new account — never a client-supplied one.
export class RegisterViaInvitationDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @Match('password', { message: 'confirmPassword must match password' })
  confirmPassword: string;
}
