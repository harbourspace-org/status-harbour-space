// One-off: truncate the probes table so the history bars rebuild from
// a clean baseline. Used after HSDEV-689 (probe noise reduction).
// CASCADE so any downstream FKs follow.
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('truncate-probes: DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main(): Promise<void> {
  const [before] = await sql`SELECT COUNT(*)::int AS n FROM probes`;
  console.log(`truncate-probes: before = ${before.n} rows`);
  await sql`TRUNCATE probes RESTART IDENTITY`;
  const [after] = await sql`SELECT COUNT(*)::int AS n FROM probes`;
  console.log(`truncate-probes: after = ${after.n} rows`);
  await sql.end();
}

main().catch((e: unknown) => {
  console.error('truncate-probes: failed', e);
  process.exit(1);
});
