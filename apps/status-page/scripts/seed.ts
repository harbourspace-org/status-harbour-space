import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { componentGroups, components } from '../app/db/schema';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('seed: DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(url, { prepare: false });
const db = drizzle(client);

const groupNames = [
  'Student-facing services',
  'Internal services',
] as const;

type GroupName = (typeof groupNames)[number];

type SeedComponent = {
  slug: string;
  name: string;
  group: GroupName;
  probeUrl: string;
  expectedStatus?: number;
  expectedBodySubstring?: string;
  severityWhenDown: 'partial_outage' | 'major_outage' | 'performance_issues';
  description?: string;
  sortOrder: number;
};

const seedComponents: SeedComponent[] = [
  {
    slug: 'marketing-website',
    name: 'Marketing website',
    group: 'Student-facing services',
    probeUrl: 'https://harbour.space/',
    // The marketing site renders the brand name in the header; if a 200
    // comes back without it, the page is blank/broken even though the
    // status code says ok.
    expectedBodySubstring: 'Harbour.Space',
    severityWhenDown: 'major_outage',
    description: 'harbour.space',
    sortOrder: 1,
  },
  {
    slug: 'student-space',
    name: 'Student Space',
    group: 'Student-facing services',
    probeUrl: 'https://student.harbour.space/',
    // Next.js mount point. If a 200 comes back without it, the Next app
    // isn't responding (CDN error page, maintenance, etc.).
    expectedBodySubstring: '__next',
    severityWhenDown: 'major_outage',
    description: 'student.harbour.space',
    sortOrder: 2,
  },
  {
    slug: 'student-admin',
    name: 'Student admin',
    group: 'Internal services',
    probeUrl: 'https://student-admin.harbour.space/admin/login',
    // Laravel Nova encodes the page component name in the inertia data
    // payload; "Nova.Login" appears whenever the login screen renders.
    expectedBodySubstring: 'Nova.Login',
    severityWhenDown: 'partial_outage',
    description: 'student-admin.harbour.space',
    sortOrder: 1,
  },
  {
    slug: 'visual-regression-service',
    name: 'Visual Regression Service',
    group: 'Internal services',
    probeUrl: 'https://qa.harbour.space/',
    // Page <title>. Stable text that's only there when the QA UI renders.
    expectedBodySubstring: 'Visual Regression',
    severityWhenDown: 'partial_outage',
    description: 'qa.harbour.space',
    sortOrder: 2,
  },
];

async function main(): Promise<void> {
  console.log('seed: starting');

  const groupIds: Record<string, number> = {};
  for (const [i, name] of groupNames.entries()) {
    const existing = await db
      .select()
      .from(componentGroups)
      .where(eq(componentGroups.name, name));
    if (existing.length > 0) {
      groupIds[name] = existing[0].id;
      continue;
    }
    const inserted = await db
      .insert(componentGroups)
      .values({ name, sortOrder: i })
      .returning();
    groupIds[name] = inserted[0].id;
  }
  console.log(`seed: ${Object.keys(groupIds).length} component groups ensured`);

  let inserted = 0;
  for (const c of seedComponents) {
    const existing = await db
      .select()
      .from(components)
      .where(eq(components.slug, c.slug));
    if (existing.length > 0) continue;

    await db.insert(components).values({
      slug: c.slug,
      name: c.name,
      groupId: groupIds[c.group],
      probeUrl: c.probeUrl,
      expectedStatus: c.expectedStatus ?? 200,
      expectedBodySubstring: c.expectedBodySubstring,
      severityWhenDown: c.severityWhenDown,
      description: c.description,
      sortOrder: c.sortOrder,
    });
    inserted += 1;
  }
  console.log(
    `seed: ${seedComponents.length} components in catalogue, ${inserted} newly inserted`,
  );

  await client.end();
  console.log('seed: done');
}

main().catch((e: unknown) => {
  console.error('seed: failed', e);
  process.exit(1);
});
