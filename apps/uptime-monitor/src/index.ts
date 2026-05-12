import { createHmac } from 'node:crypto';
import cron from 'node-cron';

type Env = {
  STATUS_PAGE_URL: string;
  AGENT_ID: string;
  AGENT_REGION: string;
  AGENT_SHARED_SECRET: string;
  PROBE_CRON: string;
  HEARTBEAT_CRON: string;
  COMPONENTS_REFRESH_CRON: string;
  PROBE_TIMEOUT_MS: number;
  PROBE_RETRY_BACKOFF_MS: number;
  MAINTENANCE_HOSTS: Set<string>;
};

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[fatal] missing env: ${key}`);
    process.exit(1);
  }
  return v;
}

// Hostnames that mean "this target is in a maintenance window" — the
// site temporarily redirects all traffic to the shared maintenance
// landing page while we deploy or operate on it. A probe that lands
// on one of these is reported as ok with error='maintenance', so the
// public bar stays green during planned work. Comma-separated env
// override available for ad-hoc maintenance hosts.
const env: Env = {
  STATUS_PAGE_URL: required('STATUS_PAGE_URL').replace(/\/$/, ''),
  AGENT_ID: required('AGENT_ID'),
  AGENT_REGION: required('AGENT_REGION'),
  AGENT_SHARED_SECRET: required('AGENT_SHARED_SECRET'),
  PROBE_CRON: process.env.PROBE_CRON ?? '0 * * * * *',
  HEARTBEAT_CRON: process.env.HEARTBEAT_CRON ?? '*/30 * * * * *',
  COMPONENTS_REFRESH_CRON: process.env.COMPONENTS_REFRESH_CRON ?? '*/5 * * * *',
  PROBE_TIMEOUT_MS: Number(process.env.PROBE_TIMEOUT_MS) || 10000,
  PROBE_RETRY_BACKOFF_MS: Number(process.env.PROBE_RETRY_BACKOFF_MS) || 250,
  MAINTENANCE_HOSTS: new Set(
    (process.env.MAINTENANCE_HOSTS ?? 'maintenance.harbour.space')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  ),
};

type Component = {
  id: string;
  slug: string;
  probe_url: string;
  expected_status: number;
  expected_body_substring: string | null;
};

const BODY_READ_LIMIT = 256 * 1024;

type ProbeResult = {
  component_id: string;
  ok: boolean;
  status_code: number;
  latency_ms: number;
  observed_at: string;
  error?: string;
};

let components: Component[] = [];

function log(msg: string, extra?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const tail = extra
    ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';
  console.log(`${ts} agent=${env.AGENT_ID} ${msg}${tail}`);
}

function sign(body: string): string {
  return createHmac('sha256', env.AGENT_SHARED_SECRET).update(body).digest('hex');
}

async function refreshComponents(): Promise<void> {
  try {
    const res = await fetch(`${env.STATUS_PAGE_URL}/api/internal/components`, {
      headers: { 'x-agent-auth': env.AGENT_SHARED_SECRET },
    });
    if (!res.ok) {
      log('refresh-components failed', { status: res.status });
      return;
    }
    const data = (await res.json()) as { components: Component[] };
    components = data.components ?? [];
    log('components refreshed', { count: components.length });
  } catch (e) {
    log('refresh-components error', { err: e instanceof Error ? e.message : String(e) });
  }
}

function isMaintenanceLanding(finalUrl: string): boolean {
  try {
    const host = new URL(finalUrl).hostname.toLowerCase();
    return env.MAINTENANCE_HOSTS.has(host);
  } catch {
    return false;
  }
}

async function probeOnce(c: Component): Promise<ProbeResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), env.PROBE_TIMEOUT_MS);
  const started = Date.now();
  let ok = false;
  let statusCode = 0;
  let error: string | undefined;
  try {
    const res = await fetch(c.probe_url, { signal: ac.signal, redirect: 'follow' });
    statusCode = res.status;
    // Maintenance redirect: target sent us to the shared maintenance
    // landing page. Treat as ok so the public bar stays green during
    // planned work; tag with error='maintenance' so it's distinguishable
    // from a real ok in raw probe rows.
    if (isMaintenanceLanding(res.url)) {
      ok = true;
      error = 'maintenance';
    } else {
      const statusOk = res.status === c.expected_status;
      if (!statusOk) {
        ok = false;
      } else if (c.expected_body_substring) {
        const body = await readBodyCapped(res, BODY_READ_LIMIT, ac.signal);
        const needle = c.expected_body_substring.toLowerCase();
        ok = body.toLowerCase().includes(needle);
        if (!ok) error = `body did not contain expected substring`;
      } else {
        ok = true;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(timer);
  }
  return {
    component_id: c.id,
    ok,
    status_code: statusCode,
    latency_ms: Date.now() - started,
    observed_at: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
}

// Retries once on failure. Single-probe blips (a 1s network hiccup, a
// 503 from Cloudflare while it failovers, a fetch that timed out at
// the 10s mark) shouldn't show up as outages — only persistent issues
// should. If the retry succeeds we report the retry's data so the
// dashboard shows real latency.
async function probeOne(c: Component): Promise<ProbeResult> {
  const first = await probeOnce(c);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, env.PROBE_RETRY_BACKOFF_MS));
  const retry = await probeOnce(c);
  return retry;
}

async function readBodyCapped(
  res: Response,
  cap: number,
  signal: AbortSignal,
): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < cap) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  const merged = new Uint8Array(Math.min(total, cap));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, cap - offset));
    merged.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= cap) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

async function runProbeCycle(): Promise<void> {
  if (components.length === 0) return;
  const results = await Promise.all(components.map(probeOne));
  const body = JSON.stringify({
    agent_id: env.AGENT_ID,
    region: env.AGENT_REGION,
    results,
  });
  try {
    const res = await fetch(`${env.STATUS_PAGE_URL}/api/internal/probes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-signature': sign(body),
      },
      body,
    });
    if (!res.ok) {
      log('probes-post failed', { status: res.status, count: results.length });
      return;
    }
    log('probes posted', {
      count: results.length,
      ok: results.filter((r) => r.ok).length,
    });
  } catch (e) {
    log('probes-post error', { err: e instanceof Error ? e.message : String(e) });
  }
}

async function sendHeartbeat(): Promise<void> {
  const body = JSON.stringify({
    agent_id: env.AGENT_ID,
    region: env.AGENT_REGION,
    sent_at: new Date().toISOString(),
  });
  try {
    const res = await fetch(`${env.STATUS_PAGE_URL}/api/internal/heartbeat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-signature': sign(body),
      },
      body,
    });
    if (!res.ok) log('heartbeat failed', { status: res.status });
  } catch (e) {
    log('heartbeat error', { err: e instanceof Error ? e.message : String(e) });
  }
}

async function main(): Promise<void> {
  log('starting', {
    region: env.AGENT_REGION,
    status_page: env.STATUS_PAGE_URL,
  });
  await refreshComponents();
  await sendHeartbeat();

  cron.schedule(env.HEARTBEAT_CRON, () => {
    void sendHeartbeat();
  });
  cron.schedule(env.PROBE_CRON, () => {
    void runProbeCycle();
  });
  cron.schedule(env.COMPONENTS_REFRESH_CRON, () => {
    void refreshComponents();
  });

  log('loops started', {
    probe: env.PROBE_CRON,
    heartbeat: env.HEARTBEAT_CRON,
    components_refresh: env.COMPONENTS_REFRESH_CRON,
  });
}

main().catch((e: unknown) => {
  console.error('[fatal]', e);
  process.exit(1);
});
