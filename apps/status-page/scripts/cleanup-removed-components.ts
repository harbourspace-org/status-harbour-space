// One-off cleanup matching PR #27. Deletes the four placeholder
// components that were dropped from the seed, plus the unused groups
// they belonged to. Cascading deletes remove their probes and any
// orphaned incident_components / schedule_components links.
//
// Run once per environment after the PR ships:
//   DATABASE_URL=<DATABASE_PUBLIC_URL> tsx scripts/cleanup-removed-components.ts
//
// Safe to re-run — it only deletes by slug/name, so idempotent.

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('cleanup: DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

const removedSlugs = ['lms', 'admissions-portal', 'auth-sso', 'api-gateway'];
const removedGroups = ['Email & notifications', 'Third-party dependencies'];

async function main(): Promise<void> {
  const components = await sql`
    DELETE FROM components
    WHERE slug = ANY(${removedSlugs})
    RETURNING slug
  `;
  console.log(`cleanup: deleted ${components.length} components: ${components.map((r) => r.slug).join(', ') || '(none)'}`);

  const groups = await sql`
    DELETE FROM component_groups
    WHERE name = ANY(${removedGroups})
    RETURNING name
  `;
  console.log(`cleanup: deleted ${groups.length} groups: ${groups.map((r) => r.name).join(', ') || '(none)'}`);

  await sql.end();
  console.log('cleanup: done');
}

main().catch((e: unknown) => {
  console.error('cleanup: failed', e);
  process.exit(1);
});
