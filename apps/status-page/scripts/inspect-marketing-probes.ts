import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main(): Promise<void> {
  const days = await sql`
    SELECT
      to_char(date_trunc('day', p.observed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE NOT p.ok)::int AS failed,
      ROUND(100.0 * COUNT(*) FILTER (WHERE NOT p.ok) / COUNT(*), 2) AS pct_failed
    FROM probes p
    JOIN components c ON c.id = p.component_id
    WHERE c.slug = 'marketing-website'
      AND p.observed_at >= NOW() - INTERVAL '14 days'
    GROUP BY day
    ORDER BY day DESC
  `;
  console.log('--- Daily summary (last 14 days) ---');
  for (const r of days)
    console.log(`${r.day}  total=${r.total}  failed=${r.failed}  pct=${r.pct_failed}%`);

  const errors = await sql`
    SELECT
      COALESCE(p.error, 'status=' || p.status_code::text) AS reason,
      COUNT(*)::int AS count
    FROM probes p
    JOIN components c ON c.id = p.component_id
    WHERE c.slug = 'marketing-website'
      AND p.observed_at >= NOW() - INTERVAL '14 days'
      AND NOT p.ok
    GROUP BY reason
    ORDER BY count DESC
    LIMIT 10
  `;
  console.log('\n--- Failure reasons (last 14 days, failed only) ---');
  for (const r of errors) console.log(`${String(r.count).padStart(5)}x  ${r.reason}`);

  await sql.end();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
