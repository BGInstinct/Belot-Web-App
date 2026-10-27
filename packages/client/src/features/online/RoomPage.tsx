/** /room/:code — joins (or re-joins after refresh) the room and shows the lobby or the game table. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PixelButton, PixelPanel, PixelScreen } from '@/components/ui';
import { useOnline } from './store';
import { useCreds } from './useCreds';
import { normalizeCode } from './util';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';
import ErrorToast, { useErrorText } from './components/ErrorToast';
import ConnectionBanner from './components/ConnectionBanner';

export default function RoomPage() {
  const { t } = useTranslation('online');
  const params = useParams();
  const code = normalizeCode(params.code ?? '');
  const navigate = useNavigate();
  const { getCreds } = useCreds();
  const joinRoom = useOnline((s) => s.joinRoom);
  const room = useOnline((s) => s.room);
  const storeCode = useOnline((s) => s.code);
  const closedReason = useOnline((s) => s.closedReason);
  const finishedDismissed = useOnline((s) => s.finishedDismissed);
  const view = useOnline((s) => s.view);
  const errorText = useErrorText();
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (code.length !== 6) {
      setJoinError('BAD_CODE');
      return;
    }
    // already in this room (just created it) → nothing to do
    if (useOnline.getState().code === code && !useOnline.getState().joining) return;
    let cancelled = false;
    setJoinError(null);
    void (async () => {
      try {
        await joinRoom(code, await getCreds());
      } catch (e) {
        if (!cancelled) setJoinError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, joinRoom, getCreds]);

  if (closedReason || joinError) {
    return (
      <PixelScreen contentClassName="flex items-center justify-center p-4">
        <PixelPanel title={closedReason ? t('room.closedTitle') : t('room.joinFailed')} className="flex max-w-md flex-col gap-4 p-5">
          <p className="text-xs leading-relaxed">{closedReason ? t('room.closedText', { reason: errorText(closedReason) }) : errorText(joinError!)}</p>
          <div className="flex flex-wrap gap-2">
            <PixelButton
              variant="blue"
              onClick={() => {
                useOnline.getState().reset();
                navigate('/play');
              }}
            >
              {t('room.toPlay')}
            </PixelButton>
            <PixelButton
              variant="dark"
              onClick={() => {
                useOnline.getState().reset();
                navigate('/');
              }}
            >
              {t('room.home')}
            </PixelButton>
          </div>
        </PixelPanel>
      </PixelScreen>
    );
  }

  if (!room || room.code !== code || storeCode !== code) {
    return (
      <PixelScreen contentClassName="flex items-center justify-center p-4">
        <PixelPanel className="flex items-center gap-3 p-5 text-xs">
          <Loader2 className="animate-spin" size={18} /> {t('room.joining', { code })}
        </PixelPanel>
        <ConnectionBanner />
      </PixelScreen>
    );
  }

  return (
    <>
      {room.status === 'lobby' || (room.status === 'finished' && (finishedDismissed || !view)) ? <Lobby room={room} /> : <GameTable room={room} />}
      <ConnectionBanner />
      <ErrorToast />
    </>
  );
}
