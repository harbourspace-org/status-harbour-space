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
};

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[fatal] missing env: ${key}`);
    process.exit(1);
  }
  return v;
}

const env: Env = {
  STATUS_PAGE_URL: required('STATUS_PAGE_URL').replace(/\/$/, ''),
  AGENT_ID: required('AGENT_ID'),
  AGENT_REGION: required('AGENT_REGION'),
  AGENT_SHARED_SECRET: required('AGENT_SHARED_SECRET'),
  PROBE_CRON: process.env.PROBE_CRON ?? '0 * * * * *',
  HEARTBEAT_CRON: process.env.HEARTBEAT_CRON ?? '*/30 * * * * *',
  COMPONENTS_REFRESH_CRON: process.env.COMPONENTS_REFRESH_CRON ?? '*/5 * * * *',
  PROBE_TIMEOUT_MS: Number(process.env.PROBE_TIMEOUT_MS) || 5000,
};

type Component = {
  id: string;
  slug: string;
  probe_url: string;
  expected_status: number;
};

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

async function probeOne(c: Component): Promise<ProbeResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), env.PROBE_TIMEOUT_MS);
  const started = Date.now();
  let ok = false;
  let statusCode = 0;
  let error: string | undefined;
  try {
    const res = await fetch(c.probe_url, { signal: ac.signal, redirect: 'follow' });
    statusCode = res.status;
    ok = res.status === c.expected_status;
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
