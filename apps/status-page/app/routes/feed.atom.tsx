import { corsHeaders } from '../cors.server';
import {
  type PublicIncident,
  getPublicIncidents,
} from '../db/public.server';
import type { Route } from './+types/feed.atom';

const SEVERITY_LABEL: Record<string, string> = {
  performance_issues: 'Performance issues',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  under_maintenance: 'Under maintenance',
};

const STATUS_LABEL: Record<string, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

function publicUrl(): string {
  return process.env.APP_URL ?? 'https://status.harbour.space';
}

function feedHost(): string {
  try {
    return new URL(publicUrl()).host;
  } catch {
    return 'status.harbour.space';
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function lastUpdatedAt(i: PublicIncident): string {
  if (i.updates.length === 0) return i.started_at;
  return i.updates[i.updates.length - 1].posted_at;
}

function entryContent(i: PublicIncident): string {
  const severity = SEVERITY_LABEL[i.severity] ?? i.severity;
  const status = STATUS_LABEL[i.current_status] ?? i.current_status;
  const parts: string[] = [`<p><strong>${escapeXml(severity)}</strong> · ${escapeXml(status)}</p>`];
  if (i.components.length > 0) {
    parts.push(
      `<p>Affected: ${escapeXml(i.components.join(', '))}</p>`,
    );
  }
  if (i.updates.length > 0) {
    parts.push('<ul>');
    for (const u of [...i.updates].reverse()) {
      const uStatus = STATUS_LABEL[u.status] ?? u.status;
      parts.push(
        `<li><strong>${escapeXml(uStatus)}</strong> (${escapeXml(u.posted_at)}): ${escapeXml(u.message)}</li>`,
      );
    }
    parts.push('</ul>');
  }
  return parts.join('');
}

function buildAtom(incidents: PublicIncident[], generatedAt: string): string {
  const host = feedHost();
  const base = publicUrl().replace(/\/$/, '');
  const feedId = `tag:${host},2026:feed`;
  const updated =
    incidents.length > 0
      ? incidents
          .map(lastUpdatedAt)
          .reduce((a, b) => (a > b ? a : b), generatedAt)
      : generatedAt;

  const entries = incidents
    .map((i) => {
      const entryId = `tag:${host},2026:incident:${i.id}`;
      const link = `${base}/#incident-${i.id}`;
      const content = entryContent(i);
      return `  <entry>
    <id>${escapeXml(entryId)}</id>
    <title>${escapeXml(i.title)}</title>
    <updated>${escapeXml(lastUpdatedAt(i))}</updated>
    <published>${escapeXml(i.started_at)}</published>
    <link rel="alternate" type="text/html" href="${escapeXml(link)}"/>
    <author><name>Harbour.Space Status</name></author>
    <content type="html">${escapeXml(content)}</content>
  </entry>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escapeXml(feedId)}</id>
  <title>Harbour.Space Status</title>
  <subtitle>Incidents and maintenance for harbour.space services</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeXml(`${base}/feed.atom`)}"/>
  <link rel="alternate" type="text/html" href="${escapeXml(`${base}/`)}"/>
  <updated>${escapeXml(updated)}</updated>
${entries}
</feed>
`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const payload = await getPublicIncidents();
  const xml = buildAtom(payload.incidents, payload.generated_at);
  return new Response(xml, {
    headers: {
      ...corsHeaders(request),
      'content-type': 'application/atom+xml; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  });
}
