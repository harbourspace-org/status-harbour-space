import { sql } from 'drizzle-orm';

import { verifyHmacRequest } from '../auth/agent.server';
import { db } from '../db/client';
import { reactToProbeBatch } from '../db/incidents.server';
import { agents, probes } from '../db/schema';
import type { Route } from './+types/api.internal.probes';

type RawProbe = {
  component_id?: unknown;
  ok?: unknown;
  status_code?: unknown;
  latency_ms?: unknown;
  observed_at?: unknown;
  error?: unknown;
};

type ProbesBody = {
  agent_id?: unknown;
  region?: unknown;
  results?: unknown;
};

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const raw = await request.text();
  const auth = verifyHmacRequest(raw, request.headers.get('x-agent-signature'));
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  let parsed: ProbesBody;
  try {
    parsed = JSON.parse(raw) as ProbesBody;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const agentId = typeof parsed.agent_id === 'string' ? parsed.agent_id : '';
  const region = typeof parsed.region === 'string' ? parsed.region : '';
  if (!agentId || !region) {
    return Response.json(
      { error: 'missing_agent_id_or_region' },
      { status: 400 },
    );
  }

  const rawResults = Array.isArray(parsed.results) ? parsed.results : [];
  const sanitized = rawResults
    .map((r) => sanitize(r as RawProbe, agentId))
    .filter((r): r is SanitizedProbe => r !== null);

  if (sanitized.length === 0) {
    return Response.json({ accepted: 0 }, { status: 202 });
  }

  await db.transaction(async (tx) => {
    // Touch the agent so heartbeat-less probes still mark it alive.
    await tx
      .insert(agents)
      .values({ id: agentId, region, lastSeenAt: new Date() })
      .onConflictDoUpdate({
        target: agents.id,
        set: { lastSeenAt: sql`NOW()`, region },
      });

    await tx.insert(probes).values(sanitized);
  });

  // Recompute status for the components we just got data for and react —
  // open auto-incidents on degradation, post Monitoring updates on
  // recovery. Wrapped in try/catch so a flaky webhook never causes the
  // agent's POST to fail (which would just trigger retries).
  const componentIds = Array.from(
    new Set(sanitized.map((s) => s.componentId)),
  );
  try {
    await reactToProbeBatch(componentIds);
  } catch (err) {
    console.warn('[probes] reactToProbeBatch failed:', err);
  }

  return Response.json({ accepted: sanitized.length }, { status: 202 });
}

export function loader() {
  return new Response('Method Not Allowed', { status: 405 });
}

type SanitizedProbe = {
  componentId: number;
  agentId: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  observedAt: Date;
};

function sanitize(p: RawProbe, agentId: string): SanitizedProbe | null {
  const componentId = Number(p.component_id);
  if (!Number.isInteger(componentId) || componentId <= 0) return null;
  if (typeof p.ok !== 'boolean') return null;
  const observedRaw = typeof p.observed_at === 'string' ? p.observed_at : '';
  const observedAt = observedRaw ? new Date(observedRaw) : new Date();
  if (Number.isNaN(observedAt.getTime())) return null;

  return {
    componentId,
    agentId,
    ok: p.ok,
    statusCode: Number.isFinite(p.status_code as number)
      ? Number(p.status_code)
      : null,
    latencyMs: Number.isFinite(p.latency_ms as number)
      ? Number(p.latency_ms)
      : null,
    error: typeof p.error === 'string' ? p.error : null,
    observedAt,
  };
}
