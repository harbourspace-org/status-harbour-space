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

// Consensus rule (HSDEV-656). Looks at the last
// PROBE_CONSENSUS_WINDOW_SECONDS of probes, taking each agent's most
// recent probe as that agent's vote:
//
//   • 0 votes failing                       → operational
//   • 1 vote failing, ≥2 agents reporting   → operational (single-zone
//                                             blip — surfaced via the
//                                             [heads-up] Slack channel,
//                                             not the public UI)
//   • ≥2 votes failing in ≥2 regions, not all → partial_outage
//   • all reporting agents failing           → component.severity_when_down
//   • ≥2 votes failing in the same region    → performance_issues
//     (uncommon since we deploy 1 agent per region — fallback)
//   • no probes in the window                → no_data
//
// Note: when only one agent is configured (e.g. before the multi-region
// roll-out completes), the "all failing" branch catches the single-fail
// case so the single-agent setup still flips the UI to down — backwards
// compatible with the descoped behaviour.
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
      // Single-agent dissent — public UI ignores it. The dissent
      // detector in reactToProbeBatch emits a [heads-up] Slack message
      // separately.
      statuses.set(componentId, 'operational');
    } else if (failingRegions.size >= 2) {
      statuses.set(componentId, 'partial_outage');
    } else {
      statuses.set(componentId, 'performance_issues');
    }
  }

  return statuses;
}

export type AgentDissent = {
  componentId: number;
  componentName: string;
  agentId: string;
  region: string;
};

// Returns (component, agent) pairs whose latest probe is failing AND
// whose previous probe was ok — i.e. an agent just flipped from ok to
// fail. Used to emit a single Slack [heads-up] on the transition edge
// without spamming on every 60s cycle while the agent stays failing.
//
// Scoped to the given componentIds so the ingestion endpoint only pays
// for the rows it actually changed.
export async function findNewAgentDissent(
  componentIds: number[],
): Promise<AgentDissent[]> {
  if (componentIds.length === 0) return [];

  const rows = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (p.component_id, p.agent_id)
        p.id, p.component_id, p.agent_id, p.ok, p.observed_at, a.region
      FROM probes p
      JOIN agents a ON a.id = p.agent_id
      WHERE p.component_id = ANY(${sql.raw(`ARRAY[${componentIds.join(',')}]::int[]`)})
        AND p.observed_at >= NOW() - (${PROBE_CONSENSUS_WINDOW_SECONDS} || ' seconds')::interval
      ORDER BY p.component_id, p.agent_id, p.observed_at DESC
    )
    SELECT
      latest.component_id,
      latest.agent_id,
      latest.region,
      c.name AS component_name
    FROM latest
    JOIN components c ON c.id = latest.component_id
    LEFT JOIN LATERAL (
      SELECT ok FROM probes prev
      WHERE prev.component_id = latest.component_id
        AND prev.agent_id = latest.agent_id
        AND prev.observed_at < latest.observed_at
      ORDER BY prev.observed_at DESC
      LIMIT 1
    ) prev ON true
    WHERE latest.ok = false AND prev.ok = true
  `)) as unknown as Array<{
    component_id: number;
    component_name: string;
    agent_id: string;
    region: string;
  }>;

  return rows.map((r) => ({
    componentId: r.component_id,
    componentName: r.component_name,
    agentId: r.agent_id,
    region: r.region,
  }));
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

type DayAgentRow = {
  component_id: number;
  day: string;
  agent_id: string;
  total: string;
  failed: string;
};

// Returns one entry per component covering the last UPTIME_WINDOW_DAYS
// days (oldest first, most recent last). Days with no probes are
// emitted as `no_data` so the UI strip has a fixed length.
//
// Per-day status uses **consensus** across the day's reporting agents:
// we take the second-highest per-agent failure ratio that day. With
// one agent the second-highest is undefined and we fall back to the
// only agent's rate (preserves single-agent behaviour). With ≥2 agents
// a single bad agent doesn't redden the bar — only when two or more
// agents agree on failure does the day colour up. Same thresholds as
// before:
//   • 0%               → operational
//   • 0% < x ≤ 1%      → performance_issues
//   • 1% < x ≤ 10%     → partial_outage
//   • > 10%            → component.severity_when_down (usually major)
//
// Tunable without DB changes.
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
      p.agent_id,
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE NOT p.ok)::text AS failed
    FROM probes p
    WHERE p.observed_at >= NOW() - (${UPTIME_WINDOW_DAYS} || ' days')::interval
    GROUP BY p.component_id, day, p.agent_id
  `)) as unknown as DayAgentRow[];

  // component -> day -> agent -> failRatio
  const byComponent = new Map<number, Map<string, Map<string, number>>>();
  for (const r of rows) {
    const total = Number(r.total);
    if (total === 0) continue;
    const ratio = Number(r.failed) / total;
    const days = byComponent.get(r.component_id) ?? new Map();
    const agents = days.get(r.day) ?? new Map();
    agents.set(r.agent_id, ratio);
    days.set(r.day, agents);
    byComponent.set(r.component_id, days);
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
    const dayMap = byComponent.get(componentId) ?? new Map();
    const severity = componentSeverities.get(componentId) ?? 'major_outage';
    const series: DayStatus[] = days.map((date) => {
      const agents = dayMap.get(date);
      if (!agents || agents.size === 0) return { date, status: 'no_data' };

      const ratios = [...agents.values()].sort((a, b) => b - a);
      // Second-highest, or fall back to the only value if a single
      // agent reported that day.
      const consensusRatio = ratios.length >= 2 ? ratios[1] : ratios[0];

      if (consensusRatio === 0) return { date, status: 'operational' };
      if (consensusRatio <= 0.01) return { date, status: 'performance_issues' };
      if (consensusRatio <= 0.1) return { date, status: 'partial_outage' };
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
