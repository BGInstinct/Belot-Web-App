import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Suit } from '@belot/engine';
import { SUIT_IS_RED, SUIT_SYMBOL, useActiveSkin } from '@/skins';
import { SuitIcon } from './SuitIcon';

const ORDER: Suit[] = ['S', 'H', 'D', 'C'];

export interface SuitHintBadgeProps {
  /** defaults to the equipped skin */
  skinId?: string;
  className?: string;
  /** start collapsed (icons only); click toggles */
  defaultCollapsed?: boolean;
  /** pip scale (default 2) */
  scale?: number;
}

/**
 * Small corner widget mapping a custom skin's pips to the real suits,
 * e.g. [flame] = ♥ Hearts. Renders nothing for the classic skins.
 * Position it yourself, e.g. `className="absolute left-2 top-2"`.
 */
export function SuitHintBadge({ skinId, className = '', defaultCollapsed = false, scale = 2 }: SuitHintBadgeProps) {
  const { t, i18n } = useTranslation('common');
  const { skin } = useActiveSkin(skinId);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (skin.id === 'default' || skin.id === 'classic-dark') return null;
  const lang = i18n.resolvedLanguage ?? i18n.language;

  return (
    <motion.button
      type="button"
      onClick={() => setCollapsed((c) => !c)}
      title={t('suitHint.title')}
      aria-expanded={!collapsed}
      className={`pixel-panel cursor-pointer select-none p-2 text-left ${className}`}
      data-tone="glass"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-1 hidden text-[8px] uppercase text-mist sm:block">{t('suitHint.title')}</div>
      <ul className={`m-0 grid list-none gap-1 p-0 ${collapsed ? 'grid-cols-4' : 'grid-cols-1'}`}>
        {ORDER.map((suit) => {
          const icon = skin.suitIcons[suit];
          const custom = (lang === 'bg' ? icon?.labels?.bg : icon?.labels?.en) ?? icon?.label;
          return (
            <li key={suit} className="flex items-center gap-1 text-[9px] leading-none text-bone sm:text-[10px]">
              <SuitIcon suit={suit} skinId={skin.id} scale={scale} title={custom} />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    className="flex items-center gap-1 whitespace-nowrap"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    <span className="text-mist">=</span>
                    <span className={SUIT_IS_RED[suit] ? 'text-ember' : 'text-paper'}>{SUIT_SYMBOL[suit]}</span>
                    <span>{t(`suits.${suit}`)}</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </motion.button>
  );
}

export default SuitHintBadge;
