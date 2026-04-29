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
  'Email & notifications',
  'Third-party dependencies',
] as const;

type GroupName = (typeof groupNames)[number];

type SeedComponent = {
  slug: string;
  name: string;
  group: GroupName;
  probeUrl: string;
  expectedStatus?: number;
  severityWhenDown: 'partial_outage' | 'major_outage' | 'performance_issues';
  description?: string;
  sortOrder: number;
};

// HTTP-probable components from docs/components.md. Non-HTTP probes
// (SMTP TCP, file-storage HEAD, third-party providers) land in a
// follow-up once the agent supports specialised probe types.
const seedComponents: SeedComponent[] = [
  {
    slug: 'marketing-website',
    name: 'Marketing website',
    group: 'Student-facing services',
    probeUrl: 'https://harbour.space/',
    severityWhenDown: 'major_outage',
    description: 'harbour.space',
    sortOrder: 1,
  },
  {
    slug: 'student-space',
    name: 'Student Space',
    group: 'Student-facing services',
    probeUrl: 'https://student.harbour.space/login',
    severityWhenDown: 'major_outage',
    description: 'student.harbour.space',
    sortOrder: 2,
  },
  {
    slug: 'lms',
    name: 'LMS',
    group: 'Student-facing services',
    probeUrl: 'https://lms.harbour.space/',
    severityWhenDown: 'major_outage',
    description: 'lms.harbour.space',
    sortOrder: 3,
  },
  {
    slug: 'admissions-portal',
    name: 'Admissions portal',
    group: 'Student-facing services',
    probeUrl: 'https://apply.harbour.space/',
    severityWhenDown: 'major_outage',
    description: 'apply.harbour.space',
    sortOrder: 4,
  },
  {
    slug: 'auth-sso',
    name: 'Authentication / SSO',
    group: 'Student-facing services',
    probeUrl: 'https://auth.harbour.space/.well-known/openid-configuration',
    severityWhenDown: 'major_outage',
    description: 'auth.harbour.space',
    sortOrder: 5,
  },
  {
    slug: 'api-gateway',
    name: 'API gateway',
    group: 'Internal services',
    probeUrl: 'https://api.harbour.space/health',
    severityWhenDown: 'partial_outage',
    description: 'api.harbour.space',
    sortOrder: 1,
  },
  {
    slug: 'visual-regression-service',
    name: 'Visual Regression Service',
    group: 'Internal services',
    probeUrl: 'https://qa.harbour.space/',
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
