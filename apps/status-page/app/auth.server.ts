import { createHmac, timingSafeEqual } from 'node:crypto';

import { createCookieSessionStorage, redirect } from 'react-router';

const TOKEN_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getAuthSecret(): string {
  const v = process.env.AUTH_SECRET;
  if (!v || v.length < 16) {
    throw new Error('AUTH_SECRET is not set (need at least 16 chars)');
  }
  return v;
}

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.toLowerCase());
}

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__status_admin',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    secrets: [process.env.AUTH_SECRET ?? 'dev-only-do-not-use-in-prod'],
    maxAge: SESSION_TTL_SECONDS,
  },
});

export async function getAdminSession(request: Request) {
  return sessionStorage.getSession(request.headers.get('Cookie'));
}

export async function commitAdminSession(
  session: Awaited<ReturnType<typeof getAdminSession>>,
) {
  return sessionStorage.commitSession(session);
}

export async function destroyAdminSession(
  session: Awaited<ReturnType<typeof getAdminSession>>,
) {
  return sessionStorage.destroySession(session);
}

// HMAC-signed magic-link token. Format: base64url(email|expiry).signature
// `expiry` is a unix-seconds timestamp. signature uses AUTH_SECRET so a
// leaked link can't be forged and expires within TOKEN_TTL_SECONDS.
export function issueMagicLinkToken(email: string): string {
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(`${email.toLowerCase()}|${expiry}`).toString(
    'base64url',
  );
  const signature = createHmac('sha256', getAuthSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyMagicLinkToken(token: string): string | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const givenSig = token.slice(dot + 1);

  const expectedSig = createHmac('sha256', getAuthSecret())
    .update(payload)
    .digest('base64url');

  let sigBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    sigBuf = Buffer.from(givenSig, 'base64url');
    expectedBuf = Buffer.from(expectedSig, 'base64url');
  } catch {
    return null;
  }
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const sep = decoded.indexOf('|');
  if (sep < 0) return null;
  const email = decoded.slice(0, sep);
  const expiry = Number(decoded.slice(sep + 1));
  if (!Number.isFinite(expiry)) return null;
  if (Math.floor(Date.now() / 1000) > expiry) return null;
  return email;
}

export async function requireAdmin(request: Request): Promise<string> {
  const session = await getAdminSession(request);
  const email = session.get('email') as string | undefined;
  if (!email || !isAdminEmail(email)) {
    const redirectTo = new URL(request.url).pathname;
    const params = new URLSearchParams({ redirectTo });
    throw redirect(`/admin/login?${params.toString()}`);
  }
  return email;
}
