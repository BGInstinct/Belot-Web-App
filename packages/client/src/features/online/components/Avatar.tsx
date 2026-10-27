import { Bot, User } from 'lucide-react';
import type { SeatInfo } from '@belot/engine';

const TEAM_BG = ['bg-sky-700', 'bg-rose-700'];

/** Seat avatar: profile picture/sprite if present, otherwise initial; bot icon for bots. */
export default function Avatar({ info, size = 40, className = '' }: { info: SeatInfo; size?: number; className?: string }) {
  const avatar = info.player?.avatar;
  const isImg = !!avatar && /^(https?:|\/|data:)/.test(avatar);
  const initial = info.player?.name?.trim()?.[0]?.toUpperCase();
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden border-4 border-black text-white shadow-[2px_2px_0_#000] ${TEAM_BG[info.seat % 2]} ${className}`}
      style={{ width: size, height: size }}
    >
      {isImg ? (
        <img src={avatar} alt="" className="pixelated h-full w-full object-cover" draggable={false} referrerPolicy="no-referrer" />
      ) : info.isBot ? (
        <Bot size={size * 0.55} />
      ) : initial ? (
        <span style={{ fontSize: size * 0.4 }}>{initial}</span>
      ) : (
        <User size={size * 0.55} className="opacity-50" />
      )}
      {info.player && !info.connected && !info.isBot && <div className="absolute inset-0 bg-black/55" />}
    </div>
  );
}
