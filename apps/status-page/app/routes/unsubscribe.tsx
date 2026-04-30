import { useTranslation } from 'react-i18next';
import { Form, useActionData, useLoaderData } from 'react-router';

import { unsubscribe } from '../db/subscribers.server';
import type { Route } from './+types/unsubscribe';

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  return { token };
}

export async function action({ request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  let bodyToken: string | null = null;
  try {
    const form = await request.formData();
    const t = form.get('token');
    if (typeof t === 'string') bodyToken = t;
  } catch {
    // Empty / non-form bodies are fine — RFC 8058 one-click clients send
    // `List-Unsubscribe=One-Click` so this branch is rare.
  }
  const token = queryToken ?? bodyToken;
  if (!token) return { ok: false as const };
  const ok = await unsubscribe(token);
  return { ok };
}

export default function Unsubscribe() {
  const { token } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const { t } = useTranslation();

  if (result) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12 sm:py-16">
        <h1 className="mb-3 text-xl font-semibold">
          {result.ok
            ? t('unsubscribe.doneTitle')
            : t('unsubscribe.failedTitle')}
        </h1>
        <p className="text-slate-700 dark:text-slate-300">
          {result.ok ? t('unsubscribe.doneBody') : t('unsubscribe.failedBody')}
        </p>
        <p className="mt-6 text-sm">
          <a className="text-brand underline" href="/">
            {t('subscribe.backHome')}
          </a>
        </p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12 sm:py-16">
        <h1 className="mb-3 text-xl font-semibold">
          {t('unsubscribe.missingTitle')}
        </h1>
        <p className="text-slate-700 dark:text-slate-300">
          {t('unsubscribe.missingBody')}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12 sm:py-16">
      <h1 className="mb-3 text-xl font-semibold">
        {t('unsubscribe.confirmTitle')}
      </h1>
      <p className="mb-6 text-slate-700 dark:text-slate-300">
        {t('unsubscribe.confirmBody')}
      </p>
      <Form method="post" className="flex gap-3">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
        >
          {t('unsubscribe.confirmButton')}
        </button>
        <a
          href="/"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {t('unsubscribe.cancelButton')}
        </a>
      </Form>
    </main>
  );
}
