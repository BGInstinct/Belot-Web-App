/** /play — create a room (with host rule toggles) or join one by its 6-character code. */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DoorOpen, LogIn, Plus, RotateCcw } from 'lucide-react';
import { DEFAULT_SETTINGS, type RoomSettings } from '@belot/engine';
import { PixelButton, PixelPanel, PixelScreen } from '@/components/ui';
import SettingsForm from './components/SettingsForm';
import { getLastRoomCode, useOnline } from './store';
import { useCreds } from './useCreds';
import { normalizeCode } from './util';
import { useErrorText } from './components/ErrorToast';

export default function PlayOnlinePage() {
  const { t } = useTranslation('online');
  const navigate = useNavigate();
  const { getCreds } = useCreds();
  const createRoom = useOnline((s) => s.createRoom);
  const errorText = useErrorText();

  const [settings, setSettings] = useState<RoomSettings>({ ...DEFAULT_SETTINGS });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRoom = getLastRoomCode();

  async function onCreate() {
    setBusy('create');
    setError(null);
    try {
      const c = await createRoom(settings, await getCreds());
      navigate(`/room/${c}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    // RoomPage performs the actual room:join (so refreshes / shared links work the same way)
    navigate(`/room/${code}`);
  }

  const formatted = code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

  return (
    <PixelScreen back="/" title={t('title')}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-6">
        {lastRoom && (
          <PixelPanel className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-xs">{t('rejoinPrompt', { code: lastRoom })}</span>
            <PixelButton variant="orange" size="sm" onClick={() => navigate(`/room/${lastRoom}`)}>
              <RotateCcw size={14} className="inline" /> {t('rejoin')}
            </PixelButton>
          </PixelPanel>
        )}

        {error && <div className="border-2 border-red-900 bg-red-700/90 p-2 text-xs text-white">{errorText(error)}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <PixelPanel title={t('create.title')} className="flex flex-col gap-4 p-4">
            <p className="text-[10px] leading-relaxed text-amber-100/80">{t('create.help')}</p>
            <SettingsForm value={settings} onChange={setSettings} />
            <PixelButton variant="green" size="lg" onClick={onCreate} disabled={busy !== null}>
              <Plus size={16} className="inline" /> {busy === 'create' ? t('create.creating') : t('create.button')}
            </PixelButton>
          </PixelPanel>

          <PixelPanel title={t('join.title')} className="flex flex-col gap-4 p-4">
            <p className="text-[10px] leading-relaxed text-amber-100/80">{t('join.help')}</p>
            <form onSubmit={onJoin} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-xs">
                {t('join.codeLabel')}
                <input
                  value={formatted}
                  onChange={(e) => setCode(normalizeCode(e.target.value))}
                  onPaste={(e) => {
                    const txt = e.clipboardData.getData('text');
                    const m = txt.match(/room\/([A-Za-z0-9]{6})/);
                    if (m) {
                      e.preventDefault();
                      setCode(normalizeCode(m[1]));
                    }
                  }}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ABC 234"
                  maxLength={7}
                  aria-label={t('join.codeLabel')}
                  className="w-full border-4 border-black bg-slate-900 px-3 py-3 text-center font-pixel text-2xl tracking-[0.3em] text-amber-200 uppercase shadow-[inset_3px_3px_0_rgba(0,0,0,0.5)] outline-none placeholder:text-slate-600 focus:border-amber-400"
                />
              </label>
              <PixelButton type="submit" variant="blue" size="lg" disabled={code.length !== 6 || busy !== null}>
                <LogIn size={16} className="inline" /> {t('join.button')}
              </PixelButton>
            </form>
            <div className="mt-auto flex items-center gap-2 text-[10px] text-amber-100/70">
              <DoorOpen size={14} /> {t('join.linkHint')}
            </div>
          </PixelPanel>
        </div>
      </div>
    </PixelScreen>
  );
}
