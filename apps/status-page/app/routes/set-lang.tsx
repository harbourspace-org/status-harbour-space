import { redirect } from 'react-router';

import type { Route } from './+types/set-lang';
import { langCookie } from '../cookies.server';
import { DEFAULT_LANG, isLang } from '../i18n';

const SAFE_REDIRECT = /^\/[^/\\]/;

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const requested = form.get('lang');
  const redirectToRaw = form.get('redirectTo');
  const lang = isLang(requested) ? requested : DEFAULT_LANG;
  const redirectTo =
    typeof redirectToRaw === 'string' && SAFE_REDIRECT.test(redirectToRaw)
      ? redirectToRaw
      : '/';

  return redirect(redirectTo, {
    headers: {
      'Set-Cookie': await langCookie.serialize(lang),
    },
  });
}

export function loader() {
  return redirect('/');
}
