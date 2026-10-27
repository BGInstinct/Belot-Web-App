import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type Language } from '@/i18n';

export interface LanguageSelectorProps {
  className?: string;
  size?: 'sm' | 'md';
}

/** EN / BG pixel toggle. */
export function LanguageSelector({ className = '', size = 'sm' }: LanguageSelectorProps) {
  const { i18n, t } = useTranslation('common');
  const current = (i18n.resolvedLanguage ?? i18n.language) as Language;
  return (
    <div
      role="radiogroup"
      aria-label={t('language.label')}
      className={`pixel-inset m-[var(--px)] inline-flex gap-[var(--px)] p-[var(--px)] ${className}`}
    >
      {LANGUAGES.map((lang) => {
        const active = current === lang;
        return (
          <button
            key={lang}
            type="button"
            role="radio"
            aria-checked={active}
            title={t(`language.${lang}`)}
            onClick={() => setLanguage(lang)}
            className={`cursor-pointer leading-none transition-colors ${
              size === 'sm' ? 'px-2 py-2 text-[10px]' : 'px-3 py-3 text-xs'
            } ${
              active
                ? 'bg-gold text-ink shadow-[inset_0_calc(var(--px)*-1)_0_0_var(--color-rust)]'
                : 'bg-night text-mist hover:bg-slate hover:text-paper'
            }`}
          >
            {lang.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSelector;
