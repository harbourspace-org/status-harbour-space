import { sql } from 'drizzle-orm';

import { db } from './client';

export type DerivedStatus =
  | 'operational'
  | 'performance_issues'
  | 'partial_outage'
  | 'major_outage'
  | 'under_maintenance'
  | 'no_data';

export const AGENT_STALE_AFTER_SECONDS = Number(
  process.env.AGENT_STALE_AFTER_SECONDS ?? 300,
);

const PROBE_CONSENSUS_WINDOW_SECONDS = 120;
const UPTIME_WINDOW_DAYS = 90;

type ProbeRow = {
  component_id: number;
  agent_id: string;
  ok: boolean;
  region: string;
};

type ComponentMeta = {
  componentId: number;
  severityWhenDown: Exclude<DerivedStatus, 'operational' | 'no_data'>;
};

// Per docs/architecture.md, every recompute looks at the last
// PROBE_CONSENSUS_WINDOW_SECONDS of probes:
//   • all agents OK            → operational
//   • exactly 1 agent failing  → performance_issues (single-zone blip)
//   • ≥2 different regions failing, not all → partial_outage
//   • all reporting agents failing → component.severity_when_down
//   • no probes in the window  → no_data (UI shows neutral indicator)
//
// HSDEV-613 will move auto-incident creation onto this helper; for now
// the homepage just reads what consensus says right now.
export async function computeComponentStatuses(
  components: ComponentMeta[],
): Promise<Map<number, DerivedStatus>> {
  const statuses = new Map<number, DerivedStatus>();
  for (const c of components) statuses.set(c.componentId, 'no_data');

  if (components.length === 0) return statuses;

  const rows = (await db.execute(sql`
    SELECT DISTINCT ON (p.component_id, p.agent_id)
      p.component_id, p.agent_id, p.ok, a.region
    FROM probes p
    JOIN agents a ON a.id = p.agent_id
    WHERE p.observed_at >= NOW() - (${PROBE_CONSENSUS_WINDOW_SECONDS} || ' seconds')::interval
    ORDER BY p.component_id, p.agent_id, p.observed_at DESC
  `)) as unknown as ProbeRow[];

  const byComponent = new Map<number, ProbeRow[]>();
  for (const r of rows) {
    const list = byComponent.get(r.component_id) ?? [];
    list.push(r);
    byComponent.set(r.component_id, list);
  }

  const severities = new Map(
    components.map((c) => [c.componentId, c.severityWhenDown]),
  );

  for (const [componentId, probes] of byComponent) {
    const total = probes.length;
    const failing = probes.filter((p) => !p.ok);
    const failingRegions = new Set(failing.map((p) => p.region));

    if (failing.length === 0) {
      statuses.set(componentId, 'operational');
    } else if (failing.length === total) {
      statuses.set(
        componentId,
        severities.get(componentId) ?? 'major_outage',
      );
    } else if (failing.length === 1) {
      statuses.set(componentId, 'performance_issues');
    } else if (failingRegions.size >= 2) {
      statuses.set(componentId, 'partial_outage');
    } else {
      statuses.set(componentId, 'performance_issues');
    }
  }

  return statuses;
}

type UptimeRow = { component_id: number; uptime: string | null };

export async function compute90DayUptime(): Promise<Map<number, number>> {
  const rows = (await db.execute(sql`
    SELECT component_id,
           AVG(CASE WHEN ok THEN 1.0 ELSE 0.0 END) AS uptime
    FROM probes
    WHERE observed_at >= NOW() - (${UPTIME_WINDOW_DAYS} || ' days')::interval
    GROUP BY component_id
  `)) as unknown as UptimeRow[];

  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.uptime === null) continue;
    out.set(r.component_id, Number(r.uptime));
  }
  return out;
}

type LastSeenRow = { last_seen: Date | null };

// `online`  → at least one agent reported within AGENT_STALE_AFTER_SECONDS
// `stale`   → an agent has heartbeated before but not recently — banner
// `never`   → no agent has ever heartbeated (pre-deploy / fresh DB)
export type MonitoringHealth = 'online' | 'stale' | 'never';

export async function getMonitoringHealth(): Promise<{
  health: MonitoringHealth;
  lastSeenAt: Date | null;
}> {
  const rows = (await db.execute(sql`
    SELECT MAX(last_seen_at) AS last_seen FROM agents
  `)) as unknown as LastSeenRow[];

  const raw = rows[0]?.last_seen;
  if (!raw) return { health: 'never', lastSeenAt: null };

  const lastSeenAt = new Date(raw);
  const ageSeconds = (Date.now() - lastSeenAt.getTime()) / 1000;
  return {
    health: ageSeconds <= AGENT_STALE_AFTER_SECONDS ? 'online' : 'stale',
    lastSeenAt,
  };
}

const STATUS_RANK: Record<DerivedStatus, number> = {
  no_data: 0,
  operational: 1,
  under_maintenance: 2,
  performance_issues: 3,
  partial_outage: 4,
  major_outage: 5,
};

export function worstStatus(values: Iterable<DerivedStatus>): DerivedStatus {
  let worst: DerivedStatus = 'operational';
  for (const v of values) {
    if (STATUS_RANK[v] > STATUS_RANK[worst]) worst = v;
  }
  return worst;
}
