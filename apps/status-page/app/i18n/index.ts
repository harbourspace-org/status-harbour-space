import { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';

export const SUPPORTED_LANGS = ['en', 'es'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';

export function isLang(value: unknown): value is Lang {
  return (
    typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value)
  );
}

export function createI18n(lng: Lang): I18nInstance {
  const instance = createInstance();
  instance.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}
