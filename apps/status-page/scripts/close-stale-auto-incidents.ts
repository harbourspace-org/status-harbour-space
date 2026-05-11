// One-off: resolve every currently-open auto-created incident with a
// hygiene message. Used 2026-05-11 to clear zombie incidents left
// behind by the probe-table truncate and the consensus-rule deploy:
//   - 4 incidents were for components that no longer exist (LMS,
//     Admissions, Auth/SSO, API gateway).
//   - 4 incidents were for current components but stayed open because
//     the system never auto-closes — only auto-monitoring updates.
//
// Idempotent: re-running it after all are resolved is a no-op.

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('cleanup: DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

const message =
  'Resolved during 2026-05-11 cleanup: this auto-incident pre-dates the probe-table truncate and the consensus-rule deploy. Closing for hygiene.';

async function main(): Promise<void> {
  const open = await sql`
    SELECT id, title FROM incidents
    WHERE is_auto_created = true AND resolved_at IS NULL
    ORDER BY id
  `;
  console.log(`cleanup: ${open.length} open auto-incidents`);
  if (open.length === 0) {
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const inc of open) {
      await tx`
        INSERT INTO incident_updates (incident_id, status, message, posted_by)
        VALUES (${inc.id}, 'resolved', ${message}, 'auto-monitor')
      `;
      await tx`
        UPDATE incidents
        SET current_status = 'resolved',
            resolved_at    = NOW(),
            updated_at     = NOW()
        WHERE id = ${inc.id}
      `;
      console.log(`cleanup: resolved #${inc.id}  ${inc.title}`);
    }
  });

  await sql.end();
  console.log('cleanup: done');
}

main().catch((e: unknown) => {
  console.error('cleanup: failed', e);
  process.exit(1);
});
