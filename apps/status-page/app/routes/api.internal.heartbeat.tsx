import { sql } from 'drizzle-orm';

import { verifyHmacRequest } from '../auth/agent.server';
import { db } from '../db/client';
import { agents } from '../db/schema';
import type { Route } from './+types/api.internal.heartbeat';

type HeartbeatBody = {
  agent_id?: unknown;
  region?: unknown;
  sent_at?: unknown;
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

  let parsed: HeartbeatBody;
  try {
    parsed = JSON.parse(raw) as HeartbeatBody;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const id = typeof parsed.agent_id === 'string' ? parsed.agent_id : '';
  const region = typeof parsed.region === 'string' ? parsed.region : '';
  if (!id || !region) {
    return Response.json({ error: 'missing_agent_id_or_region' }, { status: 400 });
  }

  // Upsert: register on first contact, update last_seen_at thereafter.
  await db
    .insert(agents)
    .values({ id, region, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: agents.id,
      set: { lastSeenAt: sql`NOW()`, region },
    });

  return new Response(null, { status: 204 });
}

export function loader() {
  return new Response('Method Not Allowed', { status: 405 });
}
