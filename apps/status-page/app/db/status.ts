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

export type DayStatus = {
  date: string;
  status: DerivedStatus;
};

type DayRow = {
  component_id: number;
  day: string;
  total: string;
  failed: string;
};

// Returns one entry per component covering the last UPTIME_WINDOW_DAYS
// days (oldest first, most recent last). Days with no probes are
// emitted as `no_data` so the UI strip has a fixed length.
//
// Per-day status is derived from the failure ratio of that day's
// probes:
//   • 0%               → operational
//   • 0% < x ≤ 1%      → performance_issues
//   • 1% < x ≤ 10%     → partial_outage
//   • > 10%            → component.severity_when_down (usually major)
//
// Picked these thresholds so a 5-minute blip (~5 failed probes out of
// ~1440 daily) shows yellow, an hour-long outage shows orange, and
// sustained issues show red. They're tunable here without DB changes.
export async function compute90DayHistory(
  componentSeverities: Map<number, Exclude<DerivedStatus, 'operational' | 'no_data'>>,
): Promise<Map<number, DayStatus[]>> {
  const componentIds = [...componentSeverities.keys()];
  const result = new Map<number, DayStatus[]>();
  if (componentIds.length === 0) return result;

  const rows = (await db.execute(sql`
    SELECT
      p.component_id,
      to_char(date_trunc('day', p.observed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE NOT p.ok)::text AS failed
    FROM probes p
    WHERE p.observed_at >= NOW() - (${UPTIME_WINDOW_DAYS} || ' days')::interval
    GROUP BY p.component_id, day
  `)) as unknown as DayRow[];

  const byComponent = new Map<number, Map<string, { total: number; failed: number }>>();
  for (const r of rows) {
    const inner = byComponent.get(r.component_id) ?? new Map();
    inner.set(r.day, { total: Number(r.total), failed: Number(r.failed) });
    byComponent.set(r.component_id, inner);
  }

  const days: string[] = [];
  const today = new Date();
  for (let i = UPTIME_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i),
    );
    days.push(d.toISOString().slice(0, 10));
  }

  for (const componentId of componentIds) {
    const inner = byComponent.get(componentId) ?? new Map();
    const severity = componentSeverities.get(componentId) ?? 'major_outage';
    const series: DayStatus[] = days.map((date) => {
      const row = inner.get(date);
      if (!row || row.total === 0) return { date, status: 'no_data' };
      if (row.failed === 0) return { date, status: 'operational' };
      const ratio = row.failed / row.total;
      if (ratio <= 0.01) return { date, status: 'performance_issues' };
      if (ratio <= 0.1) return { date, status: 'partial_outage' };
      return { date, status: severity };
    });
    result.set(componentId, series);
  }

  return result;
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
