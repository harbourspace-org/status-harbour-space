import { redirect } from 'react-router';

import { destroyAdminSession, getAdminSession } from '../../auth.server';
import type { Route } from './+types/logout';

export async function action({ request }: Route.ActionArgs) {
  const session = await getAdminSession(request);
  return redirect('/admin/login', {
    headers: { 'Set-Cookie': await destroyAdminSession(session) },
  });
}

export async function loader() {
  return redirect('/admin');
}
