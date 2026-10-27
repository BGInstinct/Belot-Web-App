import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthButton from '@/auth/AuthButton';
import { LanguageSelector } from './LanguageSelector';
import { Logo } from './Logo';

export interface TopBarProps {
  /** page title shown next to the logo */
  title?: ReactNode;
  /** show a back button; `true` = history back (falls back to '/'), string = route */
  back?: boolean | string;
  /** extra items rendered before the language selector */
  right?: ReactNode;
  /** hide the logo (e.g. on the home page where the big logo is shown) */
  hideLogo?: boolean;
}

export function TopBar({ title, back, right, hideLogo }: TopBarProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === 'string') navigate(back);
    else if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-ink/85 px-2 py-2 shadow-[0_var(--px)_0_0_var(--color-slate),0_calc(var(--px)*2)_0_0_rgb(0_0_0/0.4)] sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        {back && (
          <button
            type="button"
            onClick={goBack}
            aria-label={t('back')}
            className="pixel-border flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center bg-slate text-paper hover:bg-steel active:translate-y-[2px]"
          >
            <ArrowLeft size={18} strokeWidth={3} />
          </button>
        )}
        {!hideLogo && (
          <Link to="/" className="shrink-0 no-underline" aria-label={t('home')}>
            <Logo size="sm" />
          </Link>
        )}
        {title && (
          <h1 className="text-shadow-px m-0 hidden truncate text-[11px] text-bone sm:block sm:text-xs">
            <span className="mr-3 text-steel">/</span>
            {title}
          </h1>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {right}
        <LanguageSelector />
        <AuthButton />
      </div>
    </header>
  );
}

export default TopBar;
