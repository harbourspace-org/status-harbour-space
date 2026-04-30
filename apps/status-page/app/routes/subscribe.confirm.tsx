import { useTranslation } from 'react-i18next';
import { useLoaderData } from 'react-router';

import { confirmSubscription } from '../db/subscribers.server';
import { unsubscribeUrl } from '../subscriptions.server';
import type { Route } from './+types/subscribe.confirm';

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return { ok: false as const, unsubscribeHref: null };
  const ok = await confirmSubscription(token);
  return { ok, unsubscribeHref: ok ? unsubscribeUrl(token) : null };
}

export default function ConfirmSubscription() {
  const { ok, unsubscribeHref } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  if (!ok) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12 sm:py-16">
        <h1 className="mb-3 text-xl font-semibold">
          {t('subscribe.confirmFailedTitle')}
        </h1>
        <p className="text-slate-700 dark:text-slate-300">
          {t('subscribe.confirmFailedBody')}
        </p>
        <p className="mt-6 text-sm">
          <a className="text-brand underline" href="/subscribe">
            {t('subscribe.tryAgain')}
          </a>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12 sm:py-16">
      <h1 className="mb-3 text-xl font-semibold">
        {t('subscribe.confirmedTitle')}
      </h1>
      <p className="text-slate-700 dark:text-slate-300">
        {t('subscribe.confirmedBody')}
      </p>
      <p className="mt-6 text-sm">
        <a className="text-brand underline" href="/">
          {t('subscribe.backHome')}
        </a>
        {' · '}
        {unsubscribeHref && (
          <a className="text-slate-500 underline" href={unsubscribeHref}>
            {t('subscribe.unsubscribeLink')}
          </a>
        )}
      </p>
    </main>
  );
}
