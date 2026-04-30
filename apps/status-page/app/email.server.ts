import { Resend } from 'resend';

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

function getFrom(): string {
  const address =
    process.env.MAIL_FROM_ADDRESS ?? 'status@status.harbour.space';
  const name = process.env.MAIL_FROM_NAME ?? 'Harbour.Space Status';
  return `${name} <${address}>`;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  headers,
}: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  // No key in dev → log to stdout so the magic link is reachable without
  // wiring Resend locally. Production envs set the key in Railway.
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set, logging instead of sending');
    console.warn(`[email] To: ${to}\n[email] Subject: ${subject}\n${text}`);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to,
    subject,
    text,
    html: html ?? `<pre>${text}</pre>`,
    headers,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
