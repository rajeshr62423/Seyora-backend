import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { SendMailOptions, Transporter } from 'nodemailer';
import {
  buildInvitationEmailHtml,
  INVITATION_EMAIL_SUBJECT,
} from './templates/invitation.template';
import {
  buildPasswordResetEmailHtml,
  PASSWORD_RESET_EMAIL_SUBJECT,
} from './templates/password-reset.template';
import {
  buildTaskAssignmentEmailHtml,
  buildTaskAssignmentEmailSubject,
} from './templates/task-assignment.template';

export interface SendInvitationEmailInput {
  to: string;
  organizationName: string;
  role: string;
  inviterName?: string;
  inviterEmail?: string;
  invitationToken: string;
}

export interface SendPasswordResetEmailInput {
  to: string;
  name: string;
  resetToken: string;
  expiresInHours: number;
}

export interface SendTaskAssignmentEmailInput {
  to: string;
  taskTitle: string;
  taskDescription?: string | null;
  taskCode: string;
  assignedByName: string;
  projectName: string;
  dueDate?: string | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly fromName: string;
  private readonly fromAddress: string;
  private readonly appUrl: string;
  private readonly invitationExpiresInHours: number;

  constructor(private readonly configService: ConfigService) {
    this.fromName = this.configService.get<string>('MAIL_FROM_NAME')!;
    this.fromAddress = this.configService.get<string>('SENDER_MAIL')!;
    this.appUrl = this.configService.get<string>('APP_URL')!;
    this.invitationExpiresInHours = this.configService.get<number>(
      'INVITATION_EXPIRES_IN_HOURS',
    )!;

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: false,
      auth: {
        user: this.configService.get<string>('BREVO_SMTP_LOGIN'),
        pass: this.configService.get<string>('BREVO_SMTP_API_KEY'),
      },
    });
  }

  async sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
    const invitationUrl = `${this.appUrl}/invitations/accept?token=${input.invitationToken}`;

    const html = buildInvitationEmailHtml({
      organizationName: input.organizationName,
      role: input.role,
      inviterName: input.inviterName,
      invitationUrl,
      expirationHours: this.invitationExpiresInHours,
    });

    // The envelope sender stays the fixed, Brevo-verified address no
    // matter who's inviting — an arbitrary org owner's email can't send
    // through this SMTP account and would fail SPF/DKIM or get flagged as
    // spoofing. The inviter's name is folded into the display name instead
    // (via nodemailer's {name,address} form, which handles quoting/escaping
    // itself — never hand-interpolated into the header string), and their
    // real address goes in Reply-To so a reply reaches them, not Seyora.
    const displayName = input.inviterName
      ? `${input.inviterName} (via ${this.fromName})`
      : this.fromName;

    await this.send(
      {
        from: { name: displayName, address: this.fromAddress },
        ...(input.inviterEmail
          ? {
              replyTo: {
                name: input.inviterName ?? this.fromName,
                address: input.inviterEmail,
              },
            }
          : {}),
        to: input.to,
        subject: INVITATION_EMAIL_SUBJECT,
        html,
      },
      'Invitation email',
      input.to,
    );
  }

  async sendPasswordResetEmail(
    input: SendPasswordResetEmailInput,
  ): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${input.resetToken}`;

    const html = buildPasswordResetEmailHtml({
      name: input.name,
      resetUrl,
      expirationHours: input.expiresInHours,
    });

    await this.send(
      {
        from: { name: this.fromName, address: this.fromAddress },
        to: input.to,
        subject: PASSWORD_RESET_EMAIL_SUBJECT,
        html,
      },
      'Password reset email',
      input.to,
    );
  }

  async sendTaskAssignmentEmail(
    input: SendTaskAssignmentEmailInput,
  ): Promise<void> {
    const taskUrl = `${this.appUrl}/tasks/${input.taskCode}`;

    const html = buildTaskAssignmentEmailHtml({
      taskTitle: input.taskTitle,
      taskDescription: input.taskDescription,
      assignedByName: input.assignedByName,
      projectName: input.projectName,
      dueDate: input.dueDate,
      taskUrl,
    });

    await this.send(
      {
        from: { name: this.fromName, address: this.fromAddress },
        to: input.to,
        subject: buildTaskAssignmentEmailSubject(input.taskTitle),
        html,
      },
      'Task assignment email',
      input.to,
    );
  }

  private async send(
    mailOptions: SendMailOptions,
    logContext: string,
    recipientForLog: string,
  ): Promise<void> {
    const recipient = maskEmail(recipientForLog);

    try {
      await this.transporter.sendMail(mailOptions);
      // Recipient address only — never a token/URL, which would let a log
      // reader impersonate the link.
      this.logger.log(`${logContext} sent to ${recipient}`);
    } catch (error) {
      // Log only a short technical message — nodemailer/SMTP error objects
      // can embed the request envelope, so the full error is never logged.
      this.logger.error(
        `${logContext} failed for ${recipient}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new InternalServerErrorException(
        `Unable to send ${logContext.toLowerCase()}. Please try again later.`,
      );
    }
  }
}

// user@example.com -> u***@example.com — enough to recognize in logs
// without printing a full email address wholesale.
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
