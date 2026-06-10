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
  const url = new URL(req.url);

  // @auth/core requires POST for /signin/:provider
  if (/\/signin\/[^/]+$/.test(url.pathname)) {
    const callbackUrl = url.searchParams.get('callbackUrl') ?? '/';
    const body = new URLSearchParams({ callbackUrl, json: 'true' });
    const postReq = new Request(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return Auth(postReq, authConfig);
  }

  return Auth(req, authConfig);
}

export async function action({ request }: ActionFunctionArgs) {
  const req = ensureHttps(request);
  console.log('[auth] action URL:', req.url);
  const response = await Auth(req, authConfig);
  console.log('[auth] action status:', response.status);
  console.log('[auth] action location:', response.headers.get('location'));
  return response;
}