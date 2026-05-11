// Diagnostic: for each (component, day, agent), shows total probes
// vs. probes that belong to a "real" failure streak (≥3 consecutive
// fails for the same agent). Used to verify the streak SQL behaves
// as expected before merging.
import postgres from 'postgres';

const MIN = 3;

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main(): Promise<void> {
  const rows = await sql`
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
      WHERE p.observed_at >= NOW() - INTERVAL '14 days'
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
      c.slug,
      to_char(date_trunc('day', s.observed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      s.agent_id,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE NOT s.ok)::int AS failed_raw,
      COUNT(*) FILTER (WHERE NOT s.ok AND s.streak_len >= ${MIN})::int AS failed_real,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE NOT s.ok AND s.streak_len >= ${MIN}) / COUNT(*),
        2
      ) AS pct_real
    FROM streak_sizes s
    JOIN components c ON c.id = s.component_id
    GROUP BY c.slug, day, s.agent_id
    ORDER BY c.slug, day DESC, s.agent_id
  `;
  console.log('slug                        day         agent_id          total  raw  real  pct_real');
  for (const r of rows) {
    console.log(
      `${String(r.slug).padEnd(28)}${r.day}  ${String(r.agent_id).padEnd(16)}  ${String(r.total).padStart(5)}  ${String(r.failed_raw).padStart(3)}  ${String(r.failed_real).padStart(4)}  ${String(r.pct_real).padStart(6)}%`,
    );
  }
  await sql.end();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
