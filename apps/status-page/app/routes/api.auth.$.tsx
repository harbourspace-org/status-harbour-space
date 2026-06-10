import { Auth } from '@auth/core';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { authConfig } from '../auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // Auto-redirect signin page to keycloak provider via POST
  if (url.pathname.endsWith('/signin')) {
    const callbackUrl = url.searchParams.get('callbackUrl') ?? '/';
    const body = new URLSearchParams({
      callbackUrl,
      csrfToken: '',
      json: 'true',
    });
    const postRequest = new Request(
      new URL('/api/auth/signin/keycloak', url).toString(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    return Auth(postRequest, authConfig);
  }
  return Auth(request, authConfig);
}

export async function action({ request }: ActionFunctionArgs) {
  return Auth(request, authConfig);
}