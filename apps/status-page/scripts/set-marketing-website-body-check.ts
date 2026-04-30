// One-off: turn on the body-substring check for marketing-website so a
// 200 response without "Harbour.Space" in the body counts as a probe
// failure. Idempotent. Run after the migration has been applied.
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('set-body-check: DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main(): Promise<void> {
  const r = await sql`
    UPDATE components
    SET expected_body_substring = 'Harbour.Space'
    WHERE slug = 'marketing-website'
    RETURNING slug, expected_body_substring
  `;
  console.log(`set-body-check: ${r.length === 0 ? 'no rows' : JSON.stringify(r[0])}`);
  await sql.end();
}

main().catch((e: unknown) => {
  console.error('set-body-check: failed', e);
  process.exit(1);
});
