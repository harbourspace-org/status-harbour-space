import { corsHeaders } from '../cors.server';
import { getPublicComponents } from '../db/public.server';
import type { Route } from './+types/api.components';

export async function loader({ request }: Route.LoaderArgs) {
  const payload = await getPublicComponents();
  return Response.json(payload, {
    headers: {
      ...corsHeaders(request),
      'cache-control': 'public, max-age=15',
    },
  });
}
