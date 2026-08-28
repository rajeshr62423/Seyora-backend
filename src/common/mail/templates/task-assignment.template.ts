import { escapeHtml } from './shared';

export interface TaskAssignmentEmailParams {
  taskTitle: string;
  taskDescription?: string | null;
  assignedByName: string;
  projectName: string;
  dueDate?: string | null;
  taskUrl: string;
}

export function buildTaskAssignmentEmailSubject(taskTitle: string): string {
  return `You've been assigned a new task: ${taskTitle}`;
}

// Inline styles only — same reasoning as the other templates in this
// directory (rendered by email clients, not a browser).
export function buildTaskAssignmentEmailHtml(
  params: TaskAssignmentEmailParams,
): string {
  const {
    taskTitle,
    taskDescription,
    assignedByName,
    projectName,
    dueDate,
    taskUrl,
  } = params;

  const descriptionRow = taskDescription
    ? `
            <tr>
              <td style="padding:12px 32px 0;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#3f4a45;">
                  ${escapeHtml(taskDescription)}
                </p>
              </td>
            </tr>`
    : '';

  const dueDateRow = dueDate
    ? `
                  <tr>
                    <td style="padding:6px 16px 0;">
                      <span style="font-size:11px;color:#66736c;">Due date</span><br />
                      <strong style="font-size:13px;color:#1a211e;">${escapeHtml(dueDate)}</strong>
                    </td>
                  </tr>`
    : '';

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
                  You&rsquo;ve been assigned a new task
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 0;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#3f4a45;">
                  <strong>${escapeHtml(assignedByName)}</strong> assigned you <strong>${escapeHtml(taskTitle)}</strong> in <strong>${escapeHtml(projectName)}</strong>.
                </p>
              </td>
            </tr>${descriptionRow}
            <tr>
              <td style="padding:16px 32px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f0fdf9;border:1px solid #d1f4e6;border-radius:10px;">
                  <tr>
                    <td style="padding:10px 16px;">
                      <span style="font-size:11px;color:#66736c;">Project</span><br />
                      <strong style="font-size:13px;color:#1a211e;">${escapeHtml(projectName)}</strong>
                    </td>
                  </tr>${dueDateRow}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 0;">
                <a
                  href="${taskUrl}"
                  style="display:inline-block;background-color:#10b981;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:9px;"
                >
                  View Task
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px;border-top:1px solid #e3e9e6;margin-top:24px;">
                <p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:#8a958f;">
                  You&rsquo;re receiving this because you were assigned to this task on Seyora.
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
