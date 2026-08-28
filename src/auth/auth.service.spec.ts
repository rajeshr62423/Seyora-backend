import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { MailService } from '../common/mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const USER = {
  id: 1,
  name: 'Jordan Lee',
  email: 'jordan@example.com',
  passwordHash: 'old-hash',
  role: 'Member',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService(
  overrides: {
    findByEmail?: unknown;
    findUniqueResult?: unknown;
    transaction?: unknown;
    sendPasswordResetEmail?: () => Promise<void>;
  } = {},
) {
  // `?? USER` would be wrong here — an override explicitly set to `null`
  // (the "no such user" test case) must stay null, not fall back to USER.
  const findByEmail = jest
    .fn()
    .mockResolvedValue('findByEmail' in overrides ? overrides.findByEmail : USER);
  const updatePasswordHash = jest
    .fn()
    .mockResolvedValue({ ...USER, passwordHash: 'new-hash' });
  const usersService = {
    findByEmail,
    updatePasswordHash,
  } as unknown as UsersService;

  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const create = jest.fn().mockResolvedValue({
    id: 1,
    userId: USER.id,
    token: 'tok',
    expiresAt: new Date(),
  });
  const findUnique = jest
    .fn()
    .mockResolvedValue(overrides.findUniqueResult ?? null);
  const update = jest.fn().mockResolvedValue({ id: 1 });
  const transaction = jest.fn().mockResolvedValue(overrides.transaction ?? []);

  const prisma = {
    passwordResetToken: { updateMany, create, findUnique, update },
    $transaction: transaction,
  } as unknown as PrismaService;

  const sendPasswordResetEmail = jest
    .fn()
    .mockImplementation(
      overrides.sendPasswordResetEmail ?? (() => Promise.resolve(undefined)),
    );
  const mailService = { sendPasswordResetEmail } as unknown as MailService;

  const configService = { get: jest.fn() } as unknown as ConfigService;
  const jwtService = {} as unknown as JwtService;

  return {
    service: new AuthService(
      usersService,
      jwtService,
      configService,
      prisma,
      mailService,
    ),
    findByEmail,
    updatePasswordHash,
    updateMany,
    create,
    findUnique,
    update,
    transaction,
    sendPasswordResetEmail,
  };
}

describe('AuthService#forgotPassword', () => {
  it('does nothing observable for an unregistered email — no token, no email sent', async () => {
    const { service, create, sendPasswordResetEmail } = createService({
      findByEmail: null,
    });

    await service.forgotPassword({ email: 'nobody@example.com' });

    expect(create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('invalidates prior outstanding tokens, creates a new one, and emails it for a registered user', async () => {
    const { service, updateMany, create, sendPasswordResetEmail } =
      createService();

    await service.forgotPassword({ email: USER.email });

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: USER.id, usedAt: null },
      data: { usedAt: expect.any(Date) as Date },
    });
    const [[createArg]] = create.mock.calls as [[{ data: { userId: number } }]];
    expect(createArg.data.userId).toBe(USER.id);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: USER.email, name: USER.name }),
    );
  });

  it('resolves without throwing even when the email fails to send — enumeration protection', async () => {
    const { service } = createService({
      sendPasswordResetEmail: () => Promise.reject(new Error('smtp down')),
    });

    await expect(
      service.forgotPassword({ email: USER.email }),
    ).resolves.toBeUndefined();
  });
});

describe('AuthService#resetPassword', () => {
  const FUTURE = new Date(Date.now() + 1000 * 60 * 60);
  const PAST = new Date(Date.now() - 1000 * 60 * 60);

  it('rejects an unknown token', async () => {
    const { service } = createService({ findUniqueResult: null });

    await expect(
      service.resetPassword({
        token: 'nope',
        password: 'newpassword1',
        confirmPassword: 'newpassword1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired token', async () => {
    const { service } = createService({
      findUniqueResult: {
        id: 1,
        userId: USER.id,
        token: 'tok',
        usedAt: null,
        expiresAt: PAST,
      },
    });

    await expect(
      service.resetPassword({
        token: 'tok',
        password: 'newpassword1',
        confirmPassword: 'newpassword1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an already-used token', async () => {
    const { service } = createService({
      findUniqueResult: {
        id: 1,
        userId: USER.id,
        token: 'tok',
        usedAt: new Date(),
        expiresAt: FUTURE,
      },
    });

    await expect(
      service.resetPassword({
        token: 'tok',
        password: 'newpassword1',
        confirmPassword: 'newpassword1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hashes the new password and marks the token used for a valid token', async () => {
    const { service, updatePasswordHash, update, transaction } = createService({
      findUniqueResult: {
        id: 7,
        userId: USER.id,
        token: 'tok',
        usedAt: null,
        expiresAt: FUTURE,
      },
    });

    await service.resetPassword({
      token: 'tok',
      password: 'newpassword1',
      confirmPassword: 'newpassword1',
    });

    const [, hashArg] = updatePasswordHash.mock.calls[0] as [number, string];
    expect(updatePasswordHash).toHaveBeenCalledWith(
      USER.id,
      expect.any(String) as string,
    );
    expect(hashArg).not.toBe('newpassword1'); // stored as a bcrypt hash, never the raw password
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { usedAt: expect.any(Date) as Date },
    });
    expect(transaction).toHaveBeenCalled();
  });
});
