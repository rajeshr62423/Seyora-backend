import { plainToInstance } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  DATABASE_URL: string;

  @IsString()
  @MinLength(16)
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN: string;

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN: string;

  @IsUrl({ require_tld: false })
  CORS_ORIGIN: string;

  @IsString()
  @IsNotEmpty()
  RAZOR_KEY_ID: string;

  @IsString()
  @IsNotEmpty()
  RAZOR_SECRET_KEY: string;

  // Frontend origin invitation emails link back to
  // (${APP_URL}/invitations/accept?token=...) — deliberately separate from
  // CORS_ORIGIN even though they're the same value today, since CORS_ORIGIN
  // is an API-server concern and APP_URL is an email-content concern.
  @IsUrl({ require_tld: false })
  APP_URL: string;

  @IsInt()
  @Min(1)
  INVITATION_EXPIRES_IN_HOURS: number;

  // Optional, unlike the others above — defaults to 1 hour in code
  // (AuthService.forgotPassword) when unset, so adding this feature never
  // required touching an already-deployed .env.
  @IsOptional()
  @IsInt()
  @Min(1)
  PASSWORD_RESET_EXPIRES_IN_HOURS?: number;

  @IsString()
  @IsNotEmpty()
  MAIL_FROM_NAME: string;

  @IsEmail()
  SENDER_MAIL: string;

  @IsString()
  @IsNotEmpty()
  SMTP_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT: number;

  @IsString()
  @IsNotEmpty()
  BREVO_SMTP_LOGIN: string;

  @IsString()
  @IsNotEmpty()
  BREVO_SMTP_API_KEY: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const message = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${message}`);
  }

  return validatedConfig;
}
