/**
 * i18n setup. Every JSON file in ./locales/<lang>/<namespace>.json is auto-loaded as a namespace.
 * Each feature owns its own namespace file(s) — add keys to BOTH en and bg.
 * Usage: const { t } = useTranslation('tracker'); t('title')
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const files = import.meta.glob('./locales/*/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>;
const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, data] of Object.entries(files)) {
  const [, lang, ns] = path.match(/\.\/locales\/(\w+)\/(\w+)\.json$/)!;
  (resources[lang] ??= {})[ns] = data;
}

export const LANGUAGES = ['en', 'bg'] as const;
export type Language = (typeof LANGUAGES)[number];

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('lang') ?? 'bg',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Language) {
  localStorage.setItem('lang', lang);
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

export default i18n;
