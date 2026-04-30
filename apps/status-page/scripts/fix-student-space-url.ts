// One-off fix: the original seed pointed student-space at /login which
// returns 404, so the probe always failed. Real probe target is /. Run
// once per environment after the DB has been seeded.
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('fix: DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main(): Promise<void> {
  const r = await sql`
    UPDATE components
    SET probe_url = 'https://student.harbour.space/'
    WHERE slug = 'student-space'
    RETURNING slug, probe_url
  `;
  console.log(`fix: ${r.length === 0 ? 'no rows updated' : JSON.stringify(r[0])}`);
  await sql.end();
}

main().catch((e: unknown) => {
  console.error('fix: failed', e);
  process.exit(1);
});
