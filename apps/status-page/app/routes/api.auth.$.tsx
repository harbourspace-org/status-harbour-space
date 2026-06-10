import { Auth } from '@auth/core';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { authConfig } from '../auth.server';

function ensureHttps(request: Request): Request {
  const url = new URL(request.url);
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });
  }
  return request;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const req = ensureHttps(request);
  console.log('[auth] loader URL:', req.url);
  return Auth(req, authConfig);
}

export async function action({ request }: ActionFunctionArgs) {
  return Auth(ensureHttps(request), authConfig);
}