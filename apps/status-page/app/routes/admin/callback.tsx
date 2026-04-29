import { redirect } from 'react-router';

import {
  commitAdminSession,
  getAdminSession,
  isAdminEmail,
  verifyMagicLinkToken,
} from '../../auth.server';
import type { Route } from './+types/callback';

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const redirectTo = url.searchParams.get('redirectTo') ?? '/admin';

  if (!token) throw redirect('/admin/login');

  const email = verifyMagicLinkToken(token);
  if (!email || !isAdminEmail(email)) {
    throw redirect('/admin/login');
  }

  const session = await getAdminSession(request);
  session.set('email', email);

  throw redirect(redirectTo, {
    headers: { 'Set-Cookie': await commitAdminSession(session) },
  });
}

export default function AdminCallback() {
  return null;
}
