import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET_ENV = 'AGENT_SHARED_SECRET';

function getSecret(): string | null {
  const v = process.env[SECRET_ENV];
  return v && v.length > 0 ? v : null;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

// HMAC-SHA256 verification for POST bodies. Agent sends:
//   X-Agent-Signature: <hex digest of raw body using AGENT_SHARED_SECRET>
export function verifyHmacRequest(rawBody: string, signature: string | null): {
  ok: boolean;
  reason?: string;
} {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'server_secret_not_configured' };
  if (!signature) return { ok: false, reason: 'missing_signature' };
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeEqualHex(signature, expected)
    ? { ok: true }
    : { ok: false, reason: 'bad_signature' };
}

// Plain shared-secret check for the GET /components endpoint. Agent
// sends X-Agent-Auth: <AGENT_SHARED_SECRET>. HTTPS only — never expose
// these endpoints over plaintext.
export function verifySharedSecret(headerValue: string | null): {
  ok: boolean;
  reason?: string;
} {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'server_secret_not_configured' };
  if (!headerValue) return { ok: false, reason: 'missing_auth_header' };
  return timingSafeEqualString(headerValue, secret)
    ? { ok: true }
    : { ok: false, reason: 'bad_auth_header' };
}
