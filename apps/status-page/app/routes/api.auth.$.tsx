import { Auth } from '@auth/core';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { authConfig } from '../auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  
  if (url.pathname.endsWith('/signin') || url.pathname.includes('/signin/')) {
    const callbackUrl = url.searchParams.get('callbackUrl') ?? '/admin';
    return new Response(
      `<!DOCTYPE html>
      <html>
      <body>
        <form id="f" method="POST" action="/api/auth/signin/keycloak">
          <input type="hidden" name="callbackUrl" value="${callbackUrl}" />
          <input type="hidden" name="json" value="true" />
        </form>
        <script>document.getElementById('f').submit();</script>
      </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
  
  return Auth(request, authConfig);
}

export async function action({ request }: ActionFunctionArgs) {
  return Auth(request, authConfig);
}