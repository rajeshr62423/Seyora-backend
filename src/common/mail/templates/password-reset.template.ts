import { escapeHtml } from './shared';

export interface PasswordResetEmailParams {
  name: string;
  resetUrl: string;
  expirationHours: number;
}

export const PASSWORD_RESET_EMAIL_SUBJECT = 'Reset your Seyora password';

// Inline styles only — same reasoning as invitation.template.ts (rendered
// by email clients, not a browser).
export function buildPasswordResetEmailHtml(
  params: PasswordResetEmailParams,
): string {
  const { name, resetUrl, expirationHours } = params;

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;border:1px solid #e3e9e6;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0;">
                <div style="font-size:13px;font-weight:800;letter-spacing:2px;color:#059669;">SEYORA</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;">
                <h1 style="margin:0;font-size:20px;font-weight:760;color:#1a211e;">
                  Reset your password
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 0;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#3f4a45;">
                  Hi ${escapeHtml(name)}, we received a request to reset the password for your Seyora account.
                  If you didn&rsquo;t make this request, you can safely ignore this email — your password won&rsquo;t change.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 0;">
                <a
                  href="${resetUrl}"
                  style="display:inline-block;background-color:#10b981;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:9px;"
                >
                  Reset Password
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;">
                <p style="margin:0;font-size:12px;color:#8a958f;">
                  This link expires in ${expirationHours} hour${expirationHours === 1 ? '' : 's'} and can only be used once.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px;border-top:1px solid #e3e9e6;margin-top:24px;">
                <p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:#8a958f;">
                  If you didn&rsquo;t request a password reset, no action is needed — someone may have typed your email address by mistake.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
