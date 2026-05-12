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

// Lookback for the live status consensus. Wider than
// PROBE_CONSENSUS_WINDOW_SECONDS so each agent has enough probes inside
// it to evaluate the consecutive-failure debounce below — at the 60s
// probe cadence, 5 minutes gives the debounce plenty of headroom even
// when probes arrive jittered.
const LIVE_CONSENSUS_LOOKBACK_SECONDS = 300;

// An agent's vote only counts as "failing" once its most recent N
// probes are *all* fails — at 60s probes that is a real ≥2-minute
// outage from that observer. Single-probe transients (a CF 5xx, a
// one-off timeout) stay invisible on the public bar; they still trip
// the [heads-up] Slack channel via findNewAgentDissent.
const MIN_CONSECUTIVE_FAILURES_FOR_VOTE = 2;

// How many failing votes are needed before the public bar moves. With
// the current 4-agent fleet (railway-eu, do-nyc3, loc-dev, ss-stage)
// this is 3 — i.e. at least three independent observation paths must
// agree before we colour the bar. Fewer failing votes are surfaced
// only via the internal [heads-up] channel. The "all reporting agents
// failing" branch overrides this so smaller fleets (1–2 reporting
// agents) still flip to severity when everyone agrees.
const MIN_FAILING_VOTES_FOR_PUBLIC_FLIP = 3;

const UPTIME_WINDOW_DAYS = 90;

type AgentVoteRow = {
  component_id: number;
  agent_id: string;
  region: string;
  recent_count: string;
  any_recent_ok: boolean;
};

type ComponentMeta = {
  componentId: number;
  severityWhenDown: Exclude<DerivedStatus, 'operational' | 'no_data'>;
};

// Consensus rule (HSDEV-656, debounced in HSDEV-691).
//
// Per agent, looks at the most recent MIN_CONSECUTIVE_FAILURES_FOR_VOTE
// probes inside the LIVE_CONSENSUS_LOOKBACK_SECONDS window. The agent's
// "vote" is failing iff it has at least that many recent probes AND
// all of them are fails — at the 60s probe cadence that means a
// sustained outage from that observer of at least
// (MIN_CONSECUTIVE_FAILURES_FOR_VOTE - 1) probe intervals. Anything
// shorter (a single CF 5xx, a one-off timeout, or a brand-new agent
// that hasn't probed enough yet) votes "ok" here and is surfaced via
// the [heads-up] Slack channel by findNewAgentDissent instead.
//
// Votes then aggregate per component:
//
//   • 0 failing votes                                  → operational
//   • all reporting agents failing                     → component.severity_when_down
//                                                        (covers 1- and 2-agent
//                                                        setups too — when
//                                                        everyone agrees we
//                                                        flip even below the
//                                                        public-flip threshold)
//   • < MIN_FAILING_VOTES_FOR_PUBLIC_FLIP failing      → operational publicly
//                                                        (heads-up only)
//   • ≥ threshold failing in ≥2 regions, not all       → partial_outage
//   • ≥ threshold failing in the same region           → performance_issues
//   • no probes in the window                          → no_data
//
// Asymmetric flip-down: an agent stops failing-voting as soon as a
// single recent probe is ok, so recovery shows on the bar within ~1
// probe cycle while outage detection takes ~MIN_CONSECUTIVE_FAILURES
// cycles. That matches the operational goal: faster green, slower red.
export async function computeComponentStatuses(
  components: ComponentMeta[],
): Promise<Map<number, DerivedStatus>> {
  const statuses = new Map<number, DerivedStatus>();
  for (const c of components) statuses.set(c.componentId, 'no_data');

  if (components.length === 0) return statuses;

  // Rank each agent's probes most-recent-first within the lookback
  // window, then summarise the top MIN_CONSECUTIVE_FAILURES_FOR_VOTE
  // per (component, agent): how many we got and whether any were ok.
  // `any_recent_ok = false` together with `recent_count` at the
  // required minimum is the debounced "this agent is failing" signal.
  const rows = (await db.execute(sql`
    WITH ranked AS (
      SELECT
        p.component_id,
        p.agent_id,
        p.ok,
        p.observed_at,
        a.region,
        ROW_NUMBER() OVER (
          PARTITION BY p.component_id, p.agent_id
          ORDER BY p.observed_at DESC
        ) AS rn
      FROM probes p
      JOIN agents a ON a.id = p.agent_id
      WHERE p.observed_at >= NOW() - (${LIVE_CONSENSUS_LOOKBACK_SECONDS} || ' seconds')::interval
    )
    SELECT
      component_id,
      agent_id,
      region,
      COUNT(*)::text AS recent_count,
      bool_or(ok) AS any_recent_ok
    FROM ranked
    WHERE rn <= ${MIN_CONSECUTIVE_FAILURES_FOR_VOTE}
    GROUP BY component_id, agent_id, region
  `)) as unknown as AgentVoteRow[];

  const byComponent = new Map<number, AgentVoteRow[]>();
  for (const r of rows) {
    const list = byComponent.get(r.component_id) ?? [];
    list.push(r);
    byComponent.set(r.component_id, list);
  }

  const severities = new Map(
    components.map((c) => [c.componentId, c.severityWhenDown]),
  );

  const isAgentFailing = (r: AgentVoteRow): boolean =>
    Number(r.recent_count) >= MIN_CONSECUTIVE_FAILURES_FOR_VOTE
    && !r.any_recent_ok;

  for (const [componentId, votes] of byComponent) {
    const total = votes.length;
    const failing = votes.filter(isAgentFailing);
    const failingRegions = new Set(failing.map((v) => v.region));

    if (failing.length === 0) {
      statuses.set(componentId, 'operational');
    } else if (failing.length === total) {
      // Every reporting agent agrees → flip to severity even if the
      // count is below MIN_FAILING_VOTES_FOR_PUBLIC_FLIP, so 1- and
      // 2-agent setups remain useful.
      statuses.set(
        componentId,
        severities.get(componentId) ?? 'major_outage',
      );
    } else if (failing.length < MIN_FAILING_VOTES_FOR_PUBLIC_FLIP) {
      // Below the public-flip threshold the bar stays green. The
      // dissent detector still emits a [heads-up] Slack message for
      // these early-signal cases.
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

// A failure "counts" toward the day's bar only if it's part of a
// streak of at least this many consecutive failed probes for the same
// (component, agent). At 1 probe / minute that's a real ≥3-minute
// outage. Isolated blips (a single CF 5xx, a one-off timeout) do not
// affect the bar colour, but they're still stored in `probes` for
// raw inspection.
const MIN_CONSECUTIVE_FAILURES_FOR_BAR = 3;

// Returns one entry per component covering the last UPTIME_WINDOW_DAYS
// days (oldest first, most recent last). Days with no probes are
// emitted as `no_data` so the UI strip has a fixed length.
//
// Per-day status uses **consensus** across the day's reporting agents:
// we take the second-highest per-agent failure ratio that day. With
// one agent the second-highest is undefined and we fall back to the
// only agent's rate (preserves single-agent behaviour). With ≥2 agents
// a single bad agent doesn't redden the bar — only when two or more
// agents agree on failure does the day colour up.
//
// The failure ratio used here is computed against the "real failure"
// definition: a probe is "really failing" only when it belongs to a
// streak of MIN_CONSECUTIVE_FAILURES_FOR_BAR or more consecutive fails
// for that (component, agent). Isolated blips do not contribute to
// the ratio at all.
//
// Thresholds (tunable here without DB changes):
//   • 0%               → operational           (green)
//   • 0% < x ≤ 5%      → performance_issues    (amber)
//   • 5% < x ≤ 20%     → partial_outage        (orange)
//   • > 20%            → component.severity_when_down (usually major)
//
// At 1 probe per minute (1440/day), 5% = ~72 failed probes which is
// ~72 minutes of real continuous failure — anything less is just
// noise.
export async function compute90DayHistory(
  componentSeverities: Map<number, Exclude<DerivedStatus, 'operational' | 'no_data'>>,
): Promise<Map<number, DayStatus[]>> {
  const componentIds = [...componentSeverities.keys()];
  const result = new Map<number, DayStatus[]>();
  if (componentIds.length === 0) return result;

  // Streak-aware aggregation: gaps-and-islands.
  //
  // 1. `streaks` numbers each probe by observed_at within its
  //    (component, agent) and computes a grp id that increments
  //    every time `ok` flips — so a contiguous block of fails or
  //    of oks share the same grp.
  // 2. `streak_sizes` counts how many probes are in each grp.
  // 3. The outer SELECT counts "real failures" only when ok=false
  //    AND streak size >= MIN_CONSECUTIVE_FAILURES_FOR_BAR, and
  //    counts the total of all probes per (component, agent, day).
  const rows = (await db.execute(sql`
    WITH streaks AS (
      SELECT
        p.component_id,
        p.agent_id,
        p.observed_at,
        p.ok,
        ROW_NUMBER() OVER w AS rn,
        ROW_NUMBER() OVER w
          - ROW_NUMBER() OVER (PARTITION BY p.component_id, p.agent_id, p.ok ORDER BY p.observed_at)
          AS grp
      FROM probes p
      WHERE p.observed_at >= NOW() - (${UPTIME_WINDOW_DAYS} || ' days')::interval
      WINDOW w AS (PARTITION BY p.component_id, p.agent_id ORDER BY p.observed_at)
    ),
    streak_sizes AS (
      SELECT
        component_id,
        agent_id,
        observed_at,
        ok,
        COUNT(*) OVER (PARTITION BY component_id, agent_id, ok, grp) AS streak_len
      FROM streaks
    )
    SELECT
      component_id,
      to_char(date_trunc('day', observed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      agent_id,
      COUNT(*)::text AS total,
      COUNT(*) FILTER (
        WHERE NOT ok AND streak_len >= ${MIN_CONSECUTIVE_FAILURES_FOR_BAR}
      )::text AS failed
    FROM streak_sizes
    GROUP BY component_id, day, agent_id
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
      if (consensusRatio <= 0.05) return { date, status: 'performance_issues' };
      if (consensusRatio <= 0.2) return { date, status: 'partial_outage' };
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
