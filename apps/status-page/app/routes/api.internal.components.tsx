import { asc, eq } from 'drizzle-orm';

import { verifySharedSecret } from '../auth/agent.server';
import { db } from '../db/client';
import { components } from '../db/schema';
import type { Route } from './+types/api.internal.components';

export async function loader({ request }: Route.LoaderArgs) {
  const auth = verifySharedSecret(request.headers.get('x-agent-auth'));
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  const rows = await db
    .select({
      id: components.id,
      slug: components.slug,
      probe_url: components.probeUrl,
      expected_status: components.expectedStatus,
      expected_body_substring: components.expectedBodySubstring,
    })
    .from(components)
    .where(eq(components.isExternal, false))
    .orderBy(asc(components.sortOrder), asc(components.name));

  return Response.json({ components: rows });
}
