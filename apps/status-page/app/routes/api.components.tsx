import { getSession, isHarbourSpaceEmail } from '../auth.server';
import { corsHeaders } from '../cors.server';
import { getPublicComponents } from '../db/public.server';
import type { Route } from './+types/api.components';

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  const canSeeInternal = Boolean(
    session?.user?.email && isHarbourSpaceEmail(session.user.email),
  );
  const payload = await getPublicComponents(canSeeInternal);
  return Response.json(payload, {
    headers: {
      ...corsHeaders(request),
      'cache-control': 'public, max-age=15',
    },
  });
}
