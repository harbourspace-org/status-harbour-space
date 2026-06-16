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

  // Custom error page
  if (url.pathname.endsWith('/error')) {
    const error = url.searchParams.get('error');
    if (error === 'AccessDenied') {
      const issuer = process.env.KEYCLOAK_ISSUER ?? 'https://auth.harbour.space/auth/realms/HS';
      const keycloakLogout = `${issuer}/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent('https://status.harbour.space/')}&client_id=status-page`;
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head><title>Access Denied</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: white; }
          .box { text-align: center; padding: 2rem; }
          h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
          p { color: #94a3b8; margin-bottom: 1.5rem; }
          a { background: #3b82f6; color: white; padding: 0.5rem 1.5rem; border-radius: 0.5rem; text-decoration: none; }
        </style>
        </head>
        <body>
          <div class="box">
            <h1>Access Denied</h1>
            <p>Only @harbour.space accounts can access this page.</p>
            <a href="${keycloakLogout}">Sign out and try another account</a>
          </div>
        </body>
        </html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
  }

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
   const url = new URL(req.url);

  if (url.pathname.endsWith('/signout')) {
    const { getToken } = await import('@auth/core/jwt');
    const cookieName = '__Secure-authjs.session-token';
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET ?? '',
      cookieName,
      salt: cookieName,
    });
    const idToken = token?.idToken as string | undefined;

    // Clear @auth/core session cookie
    const authResponse = await Auth(req, authConfig);
    
    const issuer = process.env.KEYCLOAK_ISSUER ?? 'https://auth.harbour.space/auth/realms/HS';
    const postLogoutUri = encodeURIComponent('https://status.harbour.space/');
    let keycloakLogout = `${issuer}/protocol/openid-connect/logout?post_logout_redirect_uri=${postLogoutUri}&client_id=status-page`;
    if (idToken) keycloakLogout += `&id_token_hint=${idToken}`;

    // Keep Set-Cookie headers from authResponse but redirect to Keycloak
    const headers = new Headers();
    headers.set('location', keycloakLogout);
    authResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        headers.append('set-cookie', value);
      }
    });
    return new Response(null, { status: 302, headers });
  }
  
   return Auth(req, authConfig);
 }