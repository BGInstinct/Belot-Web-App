import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, RotateCcw, Trophy, Users } from 'lucide-react';
import type { PlayerView, RoomView, Seat } from '@belot/engine';
import { PixelButton } from '@/components/ui';
import { useOnline } from '../store';
import { useMyId } from '../useCreds';
import { seatName } from '../util';

/** `mobile`: portrait phone — ≥44px buttons that wrap / stretch instead of overflowing */
export default function MatchEndOverlay({ view, room, mySeat, mobile = false }: { view: PlayerView; room: RoomView; mySeat: Seat | null; mobile?: boolean }) {
  const { t } = useTranslation('game');
  const navigate = useNavigate();
  const myId = useMyId();
  const matchWinner = useOnline((s) => s.matchWinner);
  const start = useOnline((s) => s.start);
  const leaveRoom = useOnline((s) => s.leaveRoom);
  const setFinishedDismissed = useOnline((s) => s.setFinishedDismissed);
  const winner = view.winner ?? matchWinner;
  const isHost = room.hostId === myId || (mySeat !== null && room.seats[mySeat].player?.id === room.hostId);
  const myTeam = mySeat === null ? null : mySeat % 2;
  const won = winner !== null && myTeam === winner;
  const btn = mobile ? 'min-h-11! min-w-fit flex-1 whitespace-normal! leading-tight' : '';
  const names = (team: 0 | 1) =>
    ([team, team + 2] as Seat[]).map((s) => (s === mySeat ? t('you') : seatName(room, s, t('bot'), '?'))).join(' & ');

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 p-3">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="flex w-full max-w-md flex-col items-center gap-3 border-4 border-black bg-slate-900 p-4 text-center text-white shadow-[6px_6px_0_#000]"
      >
        <motion.div animate={{ rotate: [-6, 6, -6] }} transition={{ repeat: Infinity, duration: 1.6 }}>
          <Trophy size={48} className={won || myTeam === null ? 'text-amber-300' : 'text-slate-400'} />
        </motion.div>
        <h2 className={`text-lg text-amber-300 drop-shadow-[2px_2px_0_#000] ${mobile ? 'text-balance wrap-anywhere' : ''}`}>
          {winner === null ? t('matchEnd.title') : myTeam === null ? t('matchEnd.teamWins', { team: t(`team${winner}`) }) : won ? t('matchEnd.won') : t('matchEnd.lost')}
        </h2>
        {winner !== null && <p className={`text-[10px] text-slate-300 ${mobile ? 'leading-relaxed text-balance wrap-anywhere' : ''}`}>{names(winner)}</p>}
        <div className="flex items-center gap-4 text-2xl">
          <span className="text-sky-300">{view.score[0]}</span>
          <span className="text-slate-500">:</span>
          <span className="text-rose-300">{view.score[1]}</span>
        </div>
        <p className="text-[9px] text-slate-400">{t('matchEnd.rounds', { n: view.roundHistory.length })}</p>
        <div className={`flex flex-wrap justify-center gap-2 ${mobile ? 'w-full' : ''}`}>
          {isHost && (
            <PixelButton variant="green" onClick={() => void start()} className={btn}>
              <RotateCcw size={14} className="inline" /> {t('matchEnd.playAgain')}
            </PixelButton>
          )}
          <PixelButton variant="blue" onClick={() => setFinishedDismissed(true)} className={btn}>
            <Users size={14} className="inline" /> {t('matchEnd.toLobby')}
          </PixelButton>
          <PixelButton
            variant="dark"
            className={btn}
            onClick={async () => {
              await leaveRoom();
              navigate('/');
            }}
          >
            <Home size={14} className="inline" /> {t('matchEnd.home')}
          </PixelButton>
        </div>
      </motion.div>
    </div>
  );
}
