import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { MailService } from '../common/mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { getInitials } from '../common/utils/initials';
import type { User } from '@prisma/client';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { asExpiresIn } from './auth.types';
import type {
  AuthResponse,
  AuthTokens,
  AuthUser,
  JwtPayload,
} from './auth.types';

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD_RESET_EXPIRES_IN_HOURS = 1;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });

    return { ...this.issueTokens(user), user: this.toAuthUser(user) };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return { ...this.issueTokens(user), user: this.toAuthUser(user) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.issueTokens(user);
  }

  // Reused by OrganizationsService.registerViaInvitation — the invitation
  // accept-without-an-account flow needs the exact same hashing bar as a
  // normal /auth/register signup, without duplicating bcrypt/SALT_ROUNDS
  // elsewhere.
  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  // Reused by OrganizationsService.registerViaInvitation once it has
  // created the User row itself (invitation flows own their own user
  // creation, since it also needs to create the OrganizationMember in the
  // same transaction) — issues the same tokens/AuthUser shape register()
  // and login() already return, so the newly created account is
  // immediately signed in.
  issueSessionForUser(user: User): AuthResponse {
    return { ...this.issueTokens(user), user: this.toAuthUser(user) };
  }

  async me(userId: number): Promise<AuthUser> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toAuthUser(user);
  }

  async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!matches) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.usersService.updatePasswordHash(userId, passwordHash);
  }

  // Always resolves the same way whether or not the email is registered —
  // an unregistered email is treated identically to "email sent" from the
  // caller's perspective, including when the send itself fails (see the
  // swallowed catch below), so the response can never be used to enumerate
  // accounts.
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      this.logger.log('Password reset requested for an unregistered email');
      return;
    }

    const expiresInHours =
      this.configService.get<number>('PASSWORD_RESET_EXPIRES_IN_HOURS') ??
      DEFAULT_PASSWORD_RESET_EXPIRES_IN_HOURS;

    // Requesting a new link invalidates every other outstanding one for
    // this user, so at most one reset token is ever valid at a time.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(24).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
      },
    });
    this.logger.log(`Password reset token created — user ${user.id}`);

    try {
      await this.mailService.sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetToken: token,
        expiresInHours,
      });
    } catch {
      // MailService already logged the technical failure. Swallowed here,
      // not rethrown, so this method's outcome is identical to the
      // unregistered-email branch above from the caller's point of view.
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
    });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException(
        'This password reset link is invalid or has expired',
      );
    }

    const passwordHash = await this.hashPassword(dto.password);

    await this.prisma.$transaction([
      this.usersService.updatePasswordHash(resetToken.userId, passwordHash),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);
    this.logger.log(`Password reset completed — user ${resetToken.userId}`);
  }

  private issueTokens(user: User): AuthTokens {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: asExpiresIn(this.configService.get<string>('JWT_EXPIRES_IN')),
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: asExpiresIn(
        this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      ),
    });

    return { accessToken, refreshToken };
  }

  private toAuthUser(user: User): AuthUser {
    return {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: user.role,
      initials: getInitials(user.name),
      avatarUrl: user.avatarUrl,
    };
  }
}
