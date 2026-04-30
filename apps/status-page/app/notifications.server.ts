import {
  INCIDENT_STATUS_LABEL,
  type IncidentStatusValue,
} from './admin/incident-helpers';
import { findRecipientsForIncident } from './db/subscribers.server';
import { sendIncidentEmail } from './subscriptions.server';

export type IncidentNotice = {
  kind: 'opened' | 'update';
  incidentId: number;
  title: string;
  severity: string;
  status: IncidentStatusValue;
  message: string;
  componentNames: string[];
  componentIds: number[];
};

const STATUS_EMOJI: Record<IncidentStatusValue, string> = {
  investigating: '🔍',
  identified: '🛠️',
  monitoring: '👀',
  resolved: '✅',
};

const SEVERITY_LABEL: Record<string, string> = {
  performance_issues: 'Performance issues',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  under_maintenance: 'Under maintenance',
};

const TIMEOUT_MS = 5000;

function publicUrl(): string {
  return process.env.APP_URL ?? 'https://status.harbour.space';
}

function subject(n: IncidentNotice): string {
  const emoji = STATUS_EMOJI[n.status];
  const verb =
    n.kind === 'opened'
      ? 'Incident opened'
      : n.status === 'resolved'
        ? 'Incident resolved'
        : 'Incident update';
  return `${emoji} ${verb}: ${n.title}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function postSlack(n: IncidentNotice): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    const status = INCIDENT_STATUS_LABEL[n.status];
    const severity = SEVERITY_LABEL[n.severity] ?? n.severity;
    const adminLink = `${publicUrl()}/admin/incidents/${n.incidentId}`;
    const lines = [
      `*${subject(n)}*`,
      `Status: ${status}  ·  Severity: ${severity}`,
    ];
    if (n.componentNames.length > 0) {
      lines.push(`Affects: ${n.componentNames.join(', ')}`);
    }
    lines.push(`> ${n.message}`);
    lines.push(`<${adminLink}|Open in admin>  ·  ${publicUrl()}`);

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lines.join('\n') }),
    });
    if (!res.ok) {
      console.warn(`[notify] Slack webhook returned ${res.status}`);
    }
  } catch (err) {
    console.warn('[notify] Slack send failed:', err);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function postTelegram(n: IncidentNotice): Promise<void> {
  if (n.severity !== 'major_outage') return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const status = INCIDENT_STATUS_LABEL[n.status];
    const severity = SEVERITY_LABEL[n.severity] ?? n.severity;
    const lines = [
      `<b>${escapeHtml(subject(n))}</b>`,
      `Status: ${escapeHtml(status)}  ·  Severity: ${escapeHtml(severity)}`,
    ];
    if (n.componentNames.length > 0) {
      lines.push(`Affects: ${escapeHtml(n.componentNames.join(', '))}`);
    }
    lines.push(escapeHtml(n.message));
    lines.push(publicUrl());

    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join('\n'),
          parse_mode: 'HTML',
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[notify] Telegram returned ${res.status}: ${body}`);
    }
  } catch (err) {
    console.warn('[notify] Telegram send failed:', err);
  }
}

async function fanOutEmail(n: IncidentNotice): Promise<void> {
  try {
    const recipients = await findRecipientsForIncident(n.componentIds);
    if (recipients.length === 0) return;
    const severityLabel = SEVERITY_LABEL[n.severity] ?? n.severity;
    const statusLabel = INCIDENT_STATUS_LABEL[n.status];
    await Promise.allSettled(
      recipients.map((r) =>
        sendIncidentEmail(r.email, r.token, {
          incidentId: n.incidentId,
          title: n.title,
          severityLabel,
          statusLabel,
          message: n.message,
          componentNames: n.componentNames,
          kind: n.kind,
        }),
      ),
    );
  } catch (err) {
    console.warn('[notify] Email fan-out failed:', err);
  }
}

export async function notifyIncident(n: IncidentNotice): Promise<void> {
  await Promise.allSettled([postSlack(n), postTelegram(n), fanOutEmail(n)]);
}
