import { asc, eq } from 'drizzle-orm';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, useActionData, useLoaderData } from 'react-router';

import { captchaSiteKey, verifyCaptcha } from '../captcha.server';
import { db } from '../db/client';
import { components } from '../db/schema';
import { subscribe } from '../db/subscribers.server';
import { sendConfirmEmail } from '../subscriptions.server';
import type { Route } from './+types/subscribe';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function loader() {
  const componentRows = await db
    .select({ id: components.id, name: components.name })
    .from(components)
    .orderBy(asc(components.sortOrder), asc(components.name));
  return {
    siteKey: captchaSiteKey(),
    components: componentRows,
  };
}

type ActionResult =
  | {
      ok: true;
      kind: 'sent' | 'already';
      email: string;
    }
  | {
      ok: false;
      error: 'invalid-email' | 'invalid-component' | 'captcha';
      values: { email: string; componentId: string };
    };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = (form.get('email') ?? '').toString().trim().toLowerCase();
  const componentRaw = (form.get('component') ?? '').toString();
  const captchaToken = (form.get('h-captcha-response') ?? '').toString() || null;

  const values = { email, componentId: componentRaw };

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false as const, error: 'invalid-email' as const, values };
  }

  let componentId: number | null = null;
  if (componentRaw && componentRaw !== 'all') {
    const parsed = Number(componentRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false as const, error: 'invalid-component' as const, values };
    }
    componentId = parsed;
  }

  const captcha = await verifyCaptcha(captchaToken);
  if (!captcha.ok) {
    return { ok: false as const, error: 'captcha' as const, values };
  }

  const result = await subscribe(email, componentId);

  if (result.alreadyConfirmed) {
    return { ok: true as const, kind: 'already' as const, email };
  }

  let componentName: string | null = null;
  if (componentId !== null) {
    const [row] = await db
      .select({ name: components.name })
      .from(components)
      .where(eq(components.id, componentId))
      .limit(1);
    componentName = row?.name ?? null;
  }

  await sendConfirmEmail(email, result.token, componentName);
  return { ok: true as const, kind: 'sent' as const, email };
}

export default function Subscribe() {
  const data = useLoaderData<typeof loader>();
  const action = useActionData<ActionResult>();
  const { t } = useTranslation();
  const captchaContainer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!data.siteKey) return;
    if (typeof window === 'undefined') return;
    const id = 'hcaptcha-script';
    if (document.getElementById(id)) return;
    const s = document.createElement('script');
    s.id = id;
    s.src = 'https://js.hcaptcha.com/1/api.js';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, [data.siteKey]);

  if (action && action.ok) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12 sm:py-16">
        <h1 className="mb-3 text-xl font-semibold">
          {action.kind === 'sent'
            ? t('subscribe.checkEmailTitle')
            : t('subscribe.alreadyTitle')}
        </h1>
        <p className="text-slate-700 dark:text-slate-300">
          {action.kind === 'sent'
            ? t('subscribe.checkEmailBody', { email: action.email })
            : t('subscribe.alreadyBody', { email: action.email })}
        </p>
        <p className="mt-6 text-sm">
          <a className="text-brand underline" href="/">
            {t('subscribe.backHome')}
          </a>
        </p>
      </main>
    );
  }

  const errorKey = action && !action.ok ? action.error : null;
  const values = action && !action.ok ? action.values : { email: '', componentId: '' };

  return (
    <main className="mx-auto max-w-xl px-6 py-12 sm:py-16">
      <h1 className="mb-2 text-xl font-semibold tracking-tight">
        {t('subscribe.title')}
      </h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        {t('subscribe.intro')}
      </p>
      <Form method="post" className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {t('subscribe.emailLabel')}
          </span>
          <input
            type="email"
            name="email"
            required
            defaultValue={values.email}
            autoComplete="email"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {t('subscribe.scopeLabel')}
          </span>
          <select
            name="component"
            defaultValue={values.componentId || 'all'}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="all">{t('subscribe.scopeAll')}</option>
            {data.components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {data.siteKey && (
          <div
            ref={captchaContainer}
            className="h-captcha"
            data-sitekey={data.siteKey}
          />
        )}
        {errorKey && (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            {t(`subscribe.error.${errorKey}`)}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
        >
          {t('subscribe.submit')}
        </button>
      </Form>
      <p className="mt-6 text-xs text-slate-400">
        <a href="/" className="underline">
          {t('subscribe.backHome')}
        </a>
      </p>
    </main>
  );
}
