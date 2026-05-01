// Idempotent: sets `expected_body_substring` for each monitored
// component. Re-runnable; existing values are overwritten with the
// authoritative set below.
//
// Run after the schema migration is applied:
//   DATABASE_URL=<DATABASE_PUBLIC_URL> tsx scripts/set-body-checks.ts
//
// Substrings chosen to be stable signals that the page rendered
// correctly — see comments next to each one in scripts/seed.ts.
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('set-body-checks: DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

const checks: Array<{ slug: string; substring: string }> = [
  { slug: 'marketing-website', substring: 'Harbour.Space' },
  { slug: 'student-space', substring: '__next' },
  { slug: 'student-admin', substring: 'Nova.Login' },
  { slug: 'visual-regression-service', substring: 'Visual Regression' },
];

async function main(): Promise<void> {
  for (const { slug, substring } of checks) {
    const r = await sql`
      UPDATE components
      SET expected_body_substring = ${substring}
      WHERE slug = ${slug}
      RETURNING slug, expected_body_substring
    `;
    console.log(
      r.length === 0
        ? `set-body-checks: no row for ${slug}`
        : `set-body-checks: ${JSON.stringify(r[0])}`,
    );
  }
  await sql.end();
}

main().catch((e: unknown) => {
  console.error('set-body-checks: failed', e);
  process.exit(1);
});
