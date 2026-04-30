// Wraps hCaptcha verification. If both env vars are set, the public form
// is expected to render the widget and POST `h-captcha-response`; on the
// server we verify with hCaptcha. If they're missing (dev / staging
// without captcha) the verifier short-circuits to OK so subscriptions
// still work end-to-end without the widget.

export type CaptchaResult =
  | { ok: true }
  | { ok: false; reason: 'missing-token' | 'verify-failed' };

export function captchaConfigured(): boolean {
  return Boolean(process.env.HCAPTCHA_SITE_KEY && process.env.HCAPTCHA_SECRET);
}

export function captchaSiteKey(): string | null {
  return process.env.HCAPTCHA_SITE_KEY ?? null;
}

export async function verifyCaptcha(token: string | null): Promise<CaptchaResult> {
  if (!captchaConfigured()) return { ok: true };
  if (!token) return { ok: false, reason: 'missing-token' };

  const secret = process.env.HCAPTCHA_SECRET as string;
  const body = new URLSearchParams({ secret, response: token });
  try {
    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, reason: 'verify-failed' };
  } catch {
    return { ok: false, reason: 'verify-failed' };
  }
}
