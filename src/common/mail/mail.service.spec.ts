import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const sendMail = jest.fn<Promise<void>, [Record<string, unknown>]>();
const createTransport = jest.fn((options: unknown) => {
  void options;
  return { sendMail };
});

jest.mock('nodemailer', () => ({
  createTransport: (options: unknown) => createTransport(options),
}));

function sentHtml(): string {
  const [call] = sendMail.mock.calls;
  return String(call[0].html);
}

const CONFIG: Record<string, string | number> = {
  MAIL_FROM_NAME: 'Seyora',
  SENDER_MAIL: 'sender@example.com',
  APP_URL: 'https://seyora-app.vercel.app',
  INVITATION_EXPIRES_IN_HOURS: 24,
  SMTP_HOST: 'smtp-relay.brevo.com',
  SMTP_PORT: 587,
  BREVO_SMTP_LOGIN: 'brevo-login',
  BREVO_SMTP_API_KEY: 'brevo-api-key',
};

function createMailService(overrides: Partial<typeof CONFIG> = {}) {
  const merged = { ...CONFIG, ...overrides };
  const configService = {
    get: jest.fn((key: string) => merged[key]),
  } as unknown as ConfigService;

  return { service: new MailService(configService), configService };
}

describe('MailService', () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue(undefined);
    createTransport.mockClear();
  });

  it('loads SMTP credentials from ConfigService, not hardcoded values', () => {
    createMailService();
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: 'brevo-login', pass: 'brevo-api-key' },
    });
  });

  it('always sends from the fixed, verified SENDER_MAIL address — never a client/inviter-supplied one', async () => {
    const { service } = createMailService();
    await service.sendInvitationEmail({
      to: 'invitee@example.com',
      organizationName: 'Acme',
      role: 'MEMBER',
      inviterName: 'Jordan',
      inviterEmail: 'jordan@acme.example.com',
      invitationToken: 'tok123',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'Jordan (via Seyora)', address: 'sender@example.com' },
        to: 'invitee@example.com',
        subject: "You've been invited to join Seyora",
      }),
    );
  });

  it('falls back to the plain "Seyora" display name when no inviter name is provided', async () => {
    const { service } = createMailService();
    await service.sendInvitationEmail({
      to: 'invitee@example.com',
      organizationName: 'Acme',
      role: 'MEMBER',
      invitationToken: 'tok123',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'Seyora', address: 'sender@example.com' },
      }),
    );
    expect(sendMail.mock.calls[0][0]).not.toHaveProperty('replyTo');
  });

  it("sets Reply-To to the inviter's real address so replies reach them, not Seyora", async () => {
    const { service } = createMailService();
    await service.sendInvitationEmail({
      to: 'invitee@example.com',
      organizationName: 'Acme',
      role: 'MEMBER',
      inviterName: 'Jordan',
      inviterEmail: 'jordan@acme.example.com',
      invitationToken: 'tok123',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: { name: 'Jordan', address: 'jordan@acme.example.com' },
      }),
    );
  });

  it('generates the invitation URL from APP_URL and the raw token', async () => {
    const { service } = createMailService();
    await service.sendInvitationEmail({
      to: 'invitee@example.com',
      organizationName: 'Acme',
      role: 'MEMBER',
      invitationToken: 'tok123',
    });

    const html = sentHtml();
    expect(html).toContain(
      'https://seyora-app.vercel.app/invitations/accept?token=tok123',
    );
  });

  it('includes the organization name in the email body', async () => {
    const { service } = createMailService();
    await service.sendInvitationEmail({
      to: 'invitee@example.com',
      organizationName: 'Acme Rockets',
      role: 'MEMBER',
      invitationToken: 'tok123',
    });

    const html = sentHtml();
    expect(html).toContain('Acme Rockets');
  });

  it('includes the human-readable role in the email body', async () => {
    const { service } = createMailService();
    await service.sendInvitationEmail({
      to: 'invitee@example.com',
      organizationName: 'Acme',
      role: 'ADMIN',
      invitationToken: 'tok123',
    });

    const html = sentHtml();
    expect(html).toContain('Admin');
  });

  it('includes the expiration window in the email body', async () => {
    const { service } = createMailService({ INVITATION_EXPIRES_IN_HOURS: 48 });
    await service.sendInvitationEmail({
      to: 'invitee@example.com',
      organizationName: 'Acme',
      role: 'MEMBER',
      invitationToken: 'tok123',
    });

    const html = sentHtml();
    expect(html).toContain('48 hours');
  });

  it('throws a clean error and never leaks SMTP details when sending fails', async () => {
    sendMail.mockRejectedValue(
      new Error(
        '535 Authentication failed: BREVO_SMTP_API_KEY=xsmtpsib-secret-value',
      ),
    );
    const { service } = createMailService();

    await expect(
      service.sendInvitationEmail({
        to: 'invitee@example.com',
        organizationName: 'Acme',
        role: 'MEMBER',
        invitationToken: 'tok123',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    // The thrown exception is a generic, static message — nothing derived
    // from the underlying SMTP error (which could contain the API key)
    // ever reaches the caller.
    try {
      await service.sendInvitationEmail({
        to: 'invitee@example.com',
        organizationName: 'Acme',
        role: 'MEMBER',
        invitationToken: 'tok123',
      });
    } catch (error) {
      expect((error as InternalServerErrorException).message).not.toContain(
        'BREVO_SMTP_API_KEY',
      );
      expect((error as InternalServerErrorException).message).not.toContain(
        'xsmtpsib',
      );
    }
  });
});
