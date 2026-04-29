import { asc, sql } from 'drizzle-orm';
import { useLoaderData } from 'react-router';

import { formatDateTime, formatRelative } from '../../admin/format';
import { requireAdmin } from '../../auth.server';
import { db } from '../../db/client';
import { agents } from '../../db/schema';
import {
  AGENT_STALE_AFTER_SECONDS,
  getMonitoringHealth,
} from '../../db/status';
import type { Route } from './+types/agents';

type LastProbeRow = {
  agent_id: string;
  component_id: number;
  component_name: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  observed_at: string;
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [agentRows, monitoring, lastProbes] = await Promise.all([
    db.select().from(agents).orderBy(asc(agents.region), asc(agents.id)),
    getMonitoringHealth(),
    db.execute(sql`
      SELECT DISTINCT ON (p.agent_id, p.component_id)
        p.agent_id,
        p.component_id,
        p.ok,
        p.status_code,
        p.latency_ms,
        p.observed_at,
        c.name AS component_name
      FROM probes p
      JOIN components c ON c.id = p.component_id
      WHERE p.observed_at >= NOW() - INTERVAL '24 hours'
      ORDER BY p.agent_id, p.component_id, p.observed_at DESC
    `) as unknown as Promise<LastProbeRow[]>,
  ]);

  const probesByAgent = new Map<string, LastProbeRow[]>();
  for (const r of lastProbes) {
    const list = probesByAgent.get(r.agent_id) ?? [];
    list.push(r);
    probesByAgent.set(r.agent_id, list);
  }

  return {
    agents: agentRows.map((a) => ({
      ...a,
      probes: probesByAgent.get(a.id) ?? [],
      online:
        a.lastSeenAt !== null &&
        (Date.now() - new Date(a.lastSeenAt).getTime()) / 1000 <=
          AGENT_STALE_AFTER_SECONDS,
    })),
    monitoring,
    staleAfterSeconds: AGENT_STALE_AFTER_SECONDS,
  };
}

export default function AgentsTab() {
  const { agents: list, monitoring, staleAfterSeconds } =
    useLoaderData<typeof loader>();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="mt-1 text-sm text-slate-500">
          Read-only view of every uptime-monitor instance reporting in. An
          agent is considered online if its last heartbeat is within{' '}
          {staleAfterSeconds}s.
        </p>
      </div>

      <HealthCard monitoring={monitoring} />

      {list.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No agents have registered yet. Each agent registers on its first
          heartbeat.
        </p>
      ) : (
        <ul className="mt-6 space-y-6">
          {list.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
                <div>
                  <p className="font-mono text-sm font-medium">{a.id}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {a.region} · Registered {formatRelative(a.registeredAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2 w-2 rounded-full ${
                      a.online ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <span>
                    {a.online ? 'Online' : 'Stale'} ·{' '}
                    {a.lastSeenAt
                      ? `last heartbeat ${formatRelative(a.lastSeenAt)}`
                      : 'never seen'}
                  </span>
                </div>
              </header>
              {a.probes.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">
                  No probes from this agent in the last 24h.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="px-5 py-2">Component</th>
                      <th className="px-5 py-2">Result</th>
                      <th className="px-5 py-2 text-right">Latency</th>
                      <th className="px-5 py-2 text-right">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {a.probes.map((p) => (
                      <tr key={`${a.id}-${p.component_id}`}>
                        <td className="px-5 py-2">{p.component_name}</td>
                        <td className="px-5 py-2">
                          <span
                            className={
                              p.ok
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }
                          >
                            {p.ok ? 'OK' : 'Fail'}
                            {p.status_code ? ` · ${p.status_code}` : ''}
                          </span>
                        </td>
                        <td className="px-5 py-2 text-right text-xs text-slate-500">
                          {p.latency_ms === null ? '—' : `${p.latency_ms} ms`}
                        </td>
                        <td className="px-5 py-2 text-right text-xs text-slate-500">
                          {formatDateTime(p.observed_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HealthCard({
  monitoring,
}: {
  monitoring: { health: 'online' | 'stale' | 'never'; lastSeenAt: Date | null };
}) {
  const tone =
    monitoring.health === 'online'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : monitoring.health === 'never'
      ? 'border-slate-200 bg-slate-50 text-slate-700'
      : 'border-rose-200 bg-rose-50 text-rose-900';
  const label =
    monitoring.health === 'online'
      ? `At least one agent has reported recently (last heartbeat ${formatRelative(
          monitoring.lastSeenAt,
        )}).`
      : monitoring.health === 'never'
      ? 'No agent has ever reported. The public page will say "Awaiting first probe data".'
      : `All agents are stale (last heartbeat ${formatRelative(
          monitoring.lastSeenAt,
        )}). The public page is showing the "Monitoring offline" banner.`;
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>{label}</div>
  );
}
