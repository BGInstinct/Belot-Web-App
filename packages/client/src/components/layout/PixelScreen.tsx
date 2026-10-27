import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useActiveBackground } from '@/skins';
import { TopBar, type TopBarProps } from './TopBar';

export interface PixelScreenProps {
  children: ReactNode;
  className?: string;
  /** desk background id (defaults to the equipped background) */
  backgroundId?: string;
  /** hide the top bar entirely (e.g. immersive game table) */
  hideTopBar?: boolean;
  /** title shown in the top bar */
  title?: ReactNode;
  /** back button in the top bar (true = history back, string = route) */
  back?: TopBarProps['back'];
  /** extra elements in the top bar before the language selector */
  topBarRight?: ReactNode;
  /** hide the small logo in the top bar */
  hideLogo?: boolean;
  /** class for the scrollable <main> area */
  contentClassName?: string;
  /** darken the background so content pops (default true) */
  vignette?: boolean;
}

/**
 * Page frame: full-viewport tiled pixel desk (integer-scaled texture), top bar with
 * logo + LanguageSelector + AuthButton, and a scrollable content area.
 */
export function PixelScreen({
  children,
  className = '',
  backgroundId,
  hideTopBar,
  title,
  back,
  topBarRight,
  hideLogo,
  contentClassName = '',
  vignette = true,
}: PixelScreenProps) {
  const bg = useActiveBackground(backgroundId);
  const style: CSSProperties = {
    backgroundImage: `url(${bg.path})`,
    // integer scaling: one texture pixel = --px CSS pixels (3 on desktop, 2 on phones)
    backgroundSize: `calc(var(--px) * ${bg.width}) calc(var(--px) * ${bg.height})`,
  };
  return (
    <div className={`pixel-desk pixel-game relative flex min-h-full flex-col ${className}`} style={style}>
      {vignette && <div className="pixel-vignette pointer-events-none fixed inset-0 z-0" />}
      {!hideTopBar && <TopBar title={title} back={back} right={topBarRight} hideLogo={hideLogo} />}
      <motion.main
        className={`relative z-10 flex min-h-0 flex-1 flex-col ${contentClassName}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: (p: number) => Math.round(p * 4) / 4 }}
      >
        {children}
      </motion.main>
    </div>
  );
}

export default PixelScreen;
