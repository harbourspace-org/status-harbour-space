import { sendEmail } from './email.server';

function publicUrl(): string {
  return process.env.APP_URL ?? 'https://status.harbour.space';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function confirmUrl(token: string): string {
  return `${publicUrl()}/subscribe/confirm?token=${encodeURIComponent(token)}`;
}

export function unsubscribeUrl(token: string): string {
  return `${publicUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function sendConfirmEmail(
  email: string,
  token: string,
  componentName: string | null,
): Promise<void> {
  const link = confirmUrl(token);
  const scope = componentName
    ? `incidents affecting ${componentName}`
    : 'all incidents on harbour.space services';
  const text = [
    `Confirm your subscription to Harbour.Space Status updates for ${scope}.`,
    '',
    `Confirm: ${link}`,
    '',
    `If you did not request this, ignore this email — you will not be subscribed.`,
  ].join('\n');
  const html = `<p>Confirm your subscription to <strong>Harbour.Space Status</strong> updates for ${escapeHtml(scope)}.</p>
<p><a href="${escapeHtml(link)}">Confirm subscription</a></p>
<p style="color:#666;font-size:12px">If you did not request this, ignore this email — you will not be subscribed.</p>`;

  await sendEmail({
    to: email,
    subject: 'Confirm your Harbour.Space Status subscription',
    text,
    html,
  });
}

export type IncidentEmailFields = {
  incidentId: number;
  title: string;
  severityLabel: string;
  statusLabel: string;
  message: string;
  componentNames: string[];
  kind: 'opened' | 'update';
};

export async function sendIncidentEmail(
  email: string,
  token: string,
  fields: IncidentEmailFields,
): Promise<void> {
  const unsubscribe = unsubscribeUrl(token);
  const homepage = publicUrl();
  const verb =
    fields.kind === 'opened'
      ? 'Incident opened'
      : `Incident update — ${fields.statusLabel}`;
  const subject = `[Harbour.Space Status] ${fields.severityLabel}: ${fields.title}`;

  const lines = [
    verb,
    `Title: ${fields.title}`,
    `Severity: ${fields.severityLabel}`,
    `Status: ${fields.statusLabel}`,
  ];
  if (fields.componentNames.length > 0) {
    lines.push(`Affects: ${fields.componentNames.join(', ')}`);
  }
  lines.push('', fields.message, '', `Status page: ${homepage}`);
  lines.push(`Unsubscribe: ${unsubscribe}`);
  const text = lines.join('\n');

  const html = `<p><strong>${escapeHtml(verb)}</strong></p>
<p style="font-size:18px;margin:12px 0"><strong>${escapeHtml(fields.title)}</strong></p>
<table cellpadding="4" style="font-size:14px;border-collapse:collapse">
  <tr><td style="color:#666">Severity</td><td>${escapeHtml(fields.severityLabel)}</td></tr>
  <tr><td style="color:#666">Status</td><td>${escapeHtml(fields.statusLabel)}</td></tr>
  ${
    fields.componentNames.length > 0
      ? `<tr><td style="color:#666">Affects</td><td>${escapeHtml(fields.componentNames.join(', '))}</td></tr>`
      : ''
  }
</table>
<p>${escapeHtml(fields.message)}</p>
<p><a href="${escapeHtml(homepage)}">View status page</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p style="color:#666;font-size:12px">You are receiving this because you subscribed at ${escapeHtml(homepage)}.<br>
<a href="${escapeHtml(unsubscribe)}">Unsubscribe</a> · One-click unsubscribe is also supported via the email client.</p>`;

  await sendEmail({
    to: email,
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
