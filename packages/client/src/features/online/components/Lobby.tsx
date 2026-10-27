/** Room waiting lobby: room code / share link, 4 seats around a mini table, bots, settings, chat, start. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Bot, Check, Copy, Crown, LogOut, Play, Share2, Trash2, UserPlus, Wifi, WifiOff } from 'lucide-react';
import type { RoomView, Seat, SeatInfo } from '@belot/engine';
import { PixelButton, PixelPanel, PixelScreen } from '@/components/ui';
import { useOnline } from '../store';
import { useMyId } from '../useCreds';
import { findMySeat, relPos, SEATS, teamOf, type SeatPos } from '../util';
import SettingsForm, { SettingsSummary } from './SettingsForm';
import ChatPanel from './ChatPanel';
import Avatar from './Avatar';

const POS_CLASS: Record<SeatPos, string> = {
  // phones: top/bottom seats span the whole row (the centre column is too narrow for a seat card)
  bottom: 'col-span-3 col-start-1 row-start-3 sm:col-span-1 sm:col-start-2',
  top: 'col-span-3 col-start-1 row-start-1 sm:col-span-1 sm:col-start-2',
  left: 'col-start-1 row-start-2',
  right: 'col-start-3 row-start-2',
};

export default function Lobby({ room }: { room: RoomView }) {
  const { t } = useTranslation('online');
  const navigate = useNavigate();
  const { leaveRoom, start, updateSettings } = useOnline();
  const myId = useMyId();
  const mySeat = findMySeat(room, myId);
  const isHost = room.hostId === myId;
  const filled = room.seats.filter((s) => s.isBot || s.player).length;
  const [starting, setStarting] = useState(false);

  async function onLeave() {
    await leaveRoom();
    navigate('/play');
  }

  return (
    <PixelScreen title={t('lobby.title')}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg text-amber-200 drop-shadow-[2px_2px_0_#000] sm:text-2xl">{t('lobby.title')}</h1>
          <PixelButton variant="red" size="sm" onClick={onLeave}>
            <LogOut size={14} className="inline" /> {t('lobby.leave')}
          </PixelButton>
        </div>

        <RoomCodeCard code={room.code} />

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <PixelPanel title={t('lobby.seats', { count: filled })} className="p-3 sm:p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(44px,0.5fr)_minmax(0,1fr)] grid-rows-[auto_minmax(90px,auto)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(80px,1.2fr)_minmax(0,1fr)] sm:gap-3">
              {SEATS.map((seat) => (
                <div key={seat} className={`${POS_CLASS[relPos(seat, mySeat)]} flex min-w-0 justify-center`}>
                  <LobbySeat info={room.seats[seat]} mySeat={mySeat} isHost={isHost} hostId={room.hostId} />
                </div>
              ))}
              <div
                className="col-start-2 row-start-2 flex h-full min-h-24 min-w-0 items-center justify-center border-4 border-black bg-emerald-800 text-center text-[8px] leading-relaxed sm:text-[9px] text-emerald-100 shadow-[inset_4px_4px_0_rgba(0,0,0,0.35)]"
                style={{ backgroundImage: 'url(/assets/backgrounds/default-desk.png)', backgroundSize: '128px', imageRendering: 'pixelated' }}
              >
                <span className="bg-black/50 p-1">
                  <span className="text-sky-300">{t('lobby.teamA')}</span> {t('lobby.vs')} <span className="text-rose-300">{t('lobby.teamB')}</span>
                </span>
              </div>
            </div>
            <p className="mt-3 text-[9px] leading-relaxed text-amber-100/70">{t('lobby.teamsHelp')}</p>
          </PixelPanel>

          <div className="flex flex-col gap-4">
            <PixelPanel title={t('lobby.settings')} className="p-3 sm:p-4">
              {isHost ? <SettingsForm value={room.settings} onChange={(s) => void updateSettings(s)} /> : <SettingsSummary value={room.settings} />}
              {!isHost && <p className="mt-2 text-[9px] text-amber-100/60">{t('lobby.onlyHostSettings')}</p>}
            </PixelPanel>

            {isHost ? (
              <PixelButton
                variant="green"
                size="lg"
                disabled={filled < 4 || starting}
                onClick={async () => {
                  setStarting(true);
                  await start();
                  setStarting(false);
                }}
              >
                <Play size={16} className="inline" /> {filled < 4 ? t('lobby.needFour', { count: 4 - filled }) : t('lobby.start')}
              </PixelButton>
            ) : (
              <p className="border-4 border-black bg-slate-900/80 p-3 text-center text-[10px] text-amber-100">{t('lobby.waitingHost')}</p>
            )}

            <PixelPanel title={t('chat.title')} className="flex flex-col p-3">
              <ChatPanel compact />
            </PixelPanel>
          </div>
        </div>
      </div>
    </PixelScreen>
  );
}

function RoomCodeCard({ code }: { code: string }) {
  const { t } = useTranslation('online');
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const link = `${window.location.origin}/room/${code}`;

  async function copy(what: 'code' | 'link') {
    const text = what === 'code' ? code : link;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: t('lobby.shareTitle'), text: t('lobby.shareText', { code }), url: link });
        return;
      } catch {
        /* cancelled */
      }
    }
    await copy('link');
  }

  return (
    <PixelPanel className="flex flex-col items-center gap-3 p-4 sm:flex-row sm:justify-between">
      <div className="flex flex-col items-center gap-1 sm:items-start">
        <span className="text-[10px] text-amber-100/80">{t('lobby.roomCode')}</span>
        <button
          type="button"
          onClick={() => copy('code')}
          title={t('lobby.copyCode')}
          className="cursor-pointer font-pixel text-3xl tracking-[0.25em] text-amber-300 drop-shadow-[3px_3px_0_#000] sm:text-5xl"
        >
          {code}
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <PixelButton variant="orange" size="sm" onClick={() => copy('code')}>
          {copied === 'code' ? <Check size={14} className="inline" /> : <Copy size={14} className="inline" />} {copied === 'code' ? t('lobby.copied') : t('lobby.copyCode')}
        </PixelButton>
        <PixelButton variant="blue" size="sm" onClick={share}>
          {copied === 'link' ? <Check size={14} className="inline" /> : <Share2 size={14} className="inline" />} {copied === 'link' ? t('lobby.copied') : t('lobby.shareLink')}
        </PixelButton>
      </div>
    </PixelPanel>
  );
}

function LobbySeat({ info, mySeat, isHost, hostId }: { info: SeatInfo; mySeat: Seat | null; isHost: boolean; hostId: string }) {
  const { t } = useTranslation('online');
  const { sit, addBot, removeBot } = useOnline();
  const empty = !info.player && !info.isBot;
  const mine = mySeat === info.seat;
  const team = teamOf(info.seat);

  return (
    <div
      className={`flex w-full max-w-[200px] min-w-0 flex-col items-center gap-1 border-4 border-black p-2 text-center shadow-[3px_3px_0_#000] ${
        team === 0 ? 'bg-sky-950/90' : 'bg-rose-950/90'
      } ${mine ? 'outline-4 outline-amber-400' : ''}`}
    >
      <div className="flex max-w-full min-w-0 flex-col items-center gap-1 min-[400px]:flex-row min-[400px]:gap-2">
        <Avatar info={info} size={36} />
        <div className="flex max-w-full min-w-0 flex-col items-center text-center min-[400px]:items-start min-[400px]:text-left">
          <span className="max-w-full truncate text-[10px] text-white min-[400px]:max-w-[110px]">
            {info.player?.name ?? (info.isBot ? t('lobby.bot') : t('lobby.empty'))}
          </span>
          <span className={`text-[8px] ${team === 0 ? 'text-sky-300' : 'text-rose-300'}`}>{team === 0 ? t('lobby.teamA') : t('lobby.teamB')}</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-1 text-[8px]">
        {mine && <span className="bg-amber-400 px-1 text-black">{t('lobby.you')}</span>}
        {info.player && info.player.id === hostId && !info.isBot && (
          <span className="flex items-center gap-0.5 bg-yellow-600 px-1 text-black">
            <Crown size={9} /> {t('lobby.host')}
          </span>
        )}
        {info.isBot && (
          <span className="flex items-center gap-0.5 bg-slate-600 px-1 text-white">
            <Bot size={9} /> {t('lobby.bot')}
          </span>
        )}
        {info.player && !info.isBot && (
          <span className={`flex items-center gap-0.5 px-1 ${info.connected ? 'bg-emerald-700 text-white' : 'bg-red-800 text-white'}`}>
            {info.connected ? <Wifi size={9} /> : <WifiOff size={9} />} {info.connected ? t('lobby.online') : t('lobby.offline')}
          </span>
        )}
      </div>
      <div className="flex max-w-full flex-wrap justify-center gap-1 [&>button]:max-w-full [&>button]:whitespace-normal [&>button]:leading-tight">
        {empty && !mine && (
          <PixelButton size="sm" variant="green" onClick={() => sit(info.seat)}>
            {mySeat === null ? t('lobby.sit') : t('lobby.move')}
          </PixelButton>
        )}
        {empty && isHost && (
          <PixelButton size="sm" variant="dark" onClick={() => addBot(info.seat)} title={t('lobby.addBot')}>
            <UserPlus size={12} className="inline" /> {t('lobby.addBot')}
          </PixelButton>
        )}
        {info.isBot && isHost && (
          <PixelButton size="sm" variant="red" onClick={() => removeBot(info.seat)} title={t('lobby.removeBot')}>
            <Trash2 size={12} className="inline" /> {t('lobby.removeBot')}
          </PixelButton>
        )}
      </div>
    </div>
  );
}
