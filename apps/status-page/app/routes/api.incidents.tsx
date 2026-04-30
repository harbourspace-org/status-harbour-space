import { corsHeaders } from '../cors.server';
import { getPublicIncidents } from '../db/public.server';
import type { Route } from './+types/api.incidents';

export async function loader({ request }: Route.LoaderArgs) {
  const payload = await getPublicIncidents();
  return Response.json(payload, {
    headers: {
      ...corsHeaders(request),
      'cache-control': 'public, max-age=15',
    },
  });
}
