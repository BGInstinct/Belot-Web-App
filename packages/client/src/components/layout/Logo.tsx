import { motion } from 'framer-motion';
import type { Suit } from '@belot/engine';
import { SuitIcon } from '@/components/cards/SuitIcon';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export interface LogoProps {
  size?: 'sm' | 'lg';
  className?: string;
}

/** "BELOT" pixel word-mark with layered hard shadows and bobbing suit pips. */
export function Logo({ size = 'sm', className = '' }: LogoProps) {
  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <SuitIcon suit="S" scale={2} skinId="default" />
        <span className="text-sm text-paper sm:text-base" style={{ textShadow: '2px 2px 0 #a53030, 4px 4px 0 #151d28' }}>
          BELOT
        </span>
        <SuitIcon suit="H" scale={2} skinId="default" />
      </span>
    );
  }
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <div className="flex gap-3 sm:gap-5">
        {SUITS.map((s, i) => (
          <motion.span
            key={s}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: (p: number) => Math.round(p * 4) / 4 }}
            className="drop-shadow-[3px_3px_0_#151d28]"
          >
            <SuitIcon suit={s} scale={4} skinId="default" />
          </motion.span>
        ))}
      </div>
      <h1
        className="m-0 select-none text-[44px] leading-none tracking-wider text-gold sm:text-[80px]"
        style={{
          textShadow:
            '0 4px 0 #be772b, 0 8px 0 #884b2b, 4px 12px 0 #151d28, -4px 12px 0 #151d28, 0 14px 0 #151d28',
        }}
      >
        BELOT
      </h1>
    </div>
  );
}

export default Logo;
