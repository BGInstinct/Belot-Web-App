import { Pause } from 'lucide-react';
import { PixelProgressBar } from '@/components/ui';
import { useNow } from '../util';

/**
 * Progress bar driven by room.turnDeadline (epoch ms). While the game is paused the bar is frozen at
 * `pausedRemainingMs` (the server clears the deadline during a pause).
 */
export default function TurnTimer({
  deadline,
  totalSeconds,
  paused = false,
  pausedRemainingMs = null,
  className = '',
}: {
  deadline: number | null;
  totalSeconds: number;
  paused?: boolean;
  pausedRemainingMs?: number | null;
  className?: string;
}) {
  const running = !paused && deadline !== null;
  const now = useNow(200, running);
  let left: number;
  if (paused) {
    if (pausedRemainingMs === null) return null;
    left = Math.max(0, pausedRemainingMs);
  } else {
    if (deadline === null) return null;
    left = Math.max(0, deadline - now);
  }
  const value = Math.min(1, left / (totalSeconds * 1000));
  const color = paused ? 'blue' : value > 0.5 ? 'green' : value > 0.2 ? 'orange' : 'red';
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {paused && <Pause size={12} className="shrink-0 text-sky-300" />}
      <PixelProgressBar value={value} color={color} className="min-w-0 flex-1" />
      <span className={`w-8 text-right text-[10px] tabular-nums ${paused ? 'text-sky-300' : value <= 0.2 ? 'animate-pulse text-red-400' : 'text-amber-100'}`}>
        {Math.ceil(left / 1000)}s
      </span>
    </div>
  );
}
