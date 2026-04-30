import { useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';

import './app.css';
import type { Route } from './+types/root';
import { detectLang } from './i18n/detect.server';
import { DEFAULT_LANG, type Lang, createI18n } from './i18n';

export async function loader({ request }: Route.LoaderArgs) {
  const lang = await detectLang(request);
  return { lang };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  const lang: Lang = data?.lang ?? DEFAULT_LANG;
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#3c237f" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link
          rel="alternate"
          type="application/atom+xml"
          href="/feed.atom"
          title="Harbour.Space Status"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData<typeof loader>('root');
  const lang: Lang = data?.lang ?? DEFAULT_LANG;
  const i18n = useMemo(() => createI18n(lang), [lang]);
  return (
    <I18nextProvider i18n={i18n}>
      <Outlet />
    </I18nextProvider>
  );
}
