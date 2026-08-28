import { formatEnumLabel } from '../../utils/format-enum-label';
import { escapeHtml } from './shared';

export interface InvitationEmailParams {
  organizationName: string;
  role: string;
  inviterName?: string;
  invitationUrl: string;
  expirationHours: number;
}

export const INVITATION_EMAIL_SUBJECT = "You've been invited to join Seyora";

// Inline styles only — this HTML is rendered by email clients, not a
// browser, so no external stylesheet / CSS class support can be assumed.
export function buildInvitationEmailHtml(
  params: InvitationEmailParams,
): string {
  const {
    organizationName,
    role,
    inviterName,
    invitationUrl,
    expirationHours,
  } = params;
  const roleLabel = formatEnumLabel(role);
  const inviterLine = inviterName
    ? `<strong>${escapeHtml(inviterName)}</strong> has invited you to join`
    : "You've been invited to join";

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
                  You're invited to join ${escapeHtml(organizationName)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 0;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#3f4a45;">
                  ${inviterLine} <strong>${escapeHtml(organizationName)}</strong> on Seyora.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#f0fdf9;border:1px solid #d1f4e6;border-radius:10px;">
                  <tr>
                    <td style="padding:10px 16px;">
                      <span style="font-size:11px;color:#66736c;">Your role</span><br />
                      <strong style="font-size:14px;color:#065f46;">${escapeHtml(roleLabel)}</strong>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 0;">
                <a
                  href="${invitationUrl}"
                  style="display:inline-block;background-color:#10b981;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:9px;"
                >
                  Accept Invitation
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;">
                <p style="margin:0;font-size:12px;color:#8a958f;">
                  This invitation expires in ${expirationHours} hours.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px;border-top:1px solid #e3e9e6;margin-top:24px;">
                <p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:#8a958f;">
                  If you were not expecting this invitation, you can safely ignore this email.
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
