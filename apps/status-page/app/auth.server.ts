import type { AuthConfig } from '@auth/core';
import { skipCSRFCheck } from '@auth/core';
import { getToken } from '@auth/core/jwt';
import Keycloak from '@auth/core/providers/keycloak';
import { redirect } from 'react-router';

export const authConfig: AuthConfig = {
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'status-page',
      // Public client — no secret required; pass empty string to satisfy types.
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
      issuer:
        process.env.KEYCLOAK_ISSUER ??
        'https://auth.harbour.space/auth/realms/HS',
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  redirectProxyUrl: process.env.NEXTAUTH_URL,
  basePath: '/api/auth',
  // SameSite=Lax + HTTPS provides CSRF protection; skip the double-submit
  // token check so server-side signout POST works without extra round-trips.
  skipCSRFCheck,
};

export async function getSession(request: Request) {
  // Cookie name and salt must match what @auth/core uses when setting the session.
  // Secure cookies are used when NEXTAUTH_URL starts with https://.
  const secureCookie =
    process.env.NEXTAUTH_URL?.startsWith('https://') ?? false;
  const cookieName = secureCookie
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET ?? '',
    cookieName,
    salt: cookieName,
  });
  if (!token) return null;
  return {
    user: {
      email: (token.email as string | null) ?? null,
      name: (token.name as string | null) ?? null,
    },
  };
}

export function isHarbourSpaceEmail(email: string): boolean {
  return email.toLowerCase().endsWith('@harbour.space');
}

export async function requireAdmin(request: Request): Promise<string> {
  const session = await getSession(request);
  if (!session?.user?.email) {
    const redirectTo = new URL(request.url).pathname;
    const params = new URLSearchParams({ callbackUrl: redirectTo });
    throw redirect(`/api/auth/signin?${params.toString()}`);
  }
  return session.user.email;
}
