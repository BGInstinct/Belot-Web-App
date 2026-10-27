import { motion } from 'framer-motion';
import { BookOpen, ClipboardList, Globe, ShoppingBag, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Card } from '@belot/engine';
import { PixelButton, PixelPanel, PixelScreen, type PixelButtonVariant } from '@/components/ui';
import PlayingCard from '@/components/cards/PlayingCard';
import { Logo } from '@/components/layout/Logo';
import { useActiveSkin, skinDisplayName } from '@/skins';

interface MenuItem {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  variant: PixelButtonVariant;
}

/** a belot-flavoured hand: Q+K of hearts ("Belot!") flanked by trumps */
const FAN: Card[] = [
  { rank: 'J', suit: 'S' },
  { rank: '9', suit: 'D' },
  { rank: 'Q', suit: 'H' },
  { rank: 'K', suit: 'H' },
  { rank: 'A', suit: 'C' },
];
/** arc offsets (in art pixels) for the fan */
const ARC = [6, 2, 0, 2, 6];

export default function HomePage() {
  const { t, i18n } = useTranslation('home');
  const navigate = useNavigate();
  const { skin } = useActiveSkin();
  const lang = i18n.resolvedLanguage ?? i18n.language;

  const menu: MenuItem[] = [
    { to: '/play', label: t('menu.playOnline'), hint: t('menu.playOnlineHint'), icon: Globe, variant: 'green' },
    { to: '/tracker', label: t('menu.tracker'), hint: t('menu.trackerHint'), icon: ClipboardList, variant: 'blue' },
    { to: '/rules', label: t('menu.rules'), hint: t('menu.rulesHint'), icon: BookOpen, variant: 'orange' },
    { to: '/shop', label: t('menu.shop'), hint: t('menu.shopHint'), icon: ShoppingBag, variant: 'red' },
  ];

  return (
    <PixelScreen hideLogo>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-3 py-6 sm:gap-8 sm:py-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        {/* Title + card fan */}
        <section className="flex flex-col items-center gap-5 text-center sm:gap-7">
          <Logo size="lg" />
          <p className="text-shadow-px m-0 max-w-sm text-[10px] leading-relaxed text-bone sm:text-xs">{t('tagline')}</p>

          <div className="flex items-start justify-center" aria-hidden>
            {FAN.map((card, i) => (
              <motion.div
                key={`${card.rank}${card.suit}`}
                className="-mx-2 sm:-mx-3"
                style={{ zIndex: i }}
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: ARC[i] * 3, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.08, type: 'tween', duration: 0.25, ease: (p: number) => Math.round(p * 5) / 5 }}
              >
                <PlayingCard card={card} scale={3} highlighted={card.suit === 'H'} onClick={() => navigate('/rules')} />
              </motion.div>
            ))}
          </div>
          <p className="m-0 flex items-center gap-2 text-[9px] text-mist sm:text-[10px]">
            {t('equipped')}: <span className="text-gold">{skinDisplayName(skin, lang)}</span>
          </p>
        </section>

        {/* Main menu */}
        <motion.nav
          className="w-full max-w-sm"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.2 }}
          aria-label={t('menu.title')}
        >
          <PixelPanel title={t('menu.title')} tone="glass">
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {menu.map(({ to, label, hint, icon: Icon, variant }, i) => (
                <motion.li
                  key={to}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.06, duration: 0.15 }}
                >
                  <PixelButton
                    variant={variant}
                    size="lg"
                    block
                    onClick={() => navigate(to)}
                    className="!justify-start text-left"
                    icon={<Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />}
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate">{label}</span>
                      <span className="whitespace-normal text-[8px] leading-snug opacity-90 [text-shadow:none] sm:text-[9px]">{hint}</span>
                    </span>
                  </PixelButton>
                </motion.li>
              ))}
            </ul>
            <p className="mb-0 mt-5 text-center text-[9px] text-mist">
              <span className="animate-blink inline-block">▶</span> {t('pressStart')}
            </p>
          </PixelPanel>
        </motion.nav>
      </div>

      <footer className="text-shadow-px relative z-10 pb-4 text-center text-[8px] text-steel sm:text-[9px]">{t('footer')}</footer>
    </PixelScreen>
  );
}
