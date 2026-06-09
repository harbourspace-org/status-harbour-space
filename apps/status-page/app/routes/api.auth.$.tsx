import { Auth } from '@auth/core';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { authConfig } from '../auth.server';

function toAuthRequest(request: Request): Request {
  const url = new URL(request.url);
  // Ensure the URL path matches what @auth/core expects
  if (!url.pathname.startsWith('/api/auth')) {
    url.pathname = '/api/auth' + url.pathname.replace(/.*\/api\/auth/, '');
  }
  return new Request(url.toString(), request);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return Auth(toAuthRequest(request), authConfig);
}

export async function action({ request }: ActionFunctionArgs) {
  return Auth(toAuthRequest(request), authConfig);
}