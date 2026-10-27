import { useTranslation } from 'react-i18next';
import { DEFAULT_SETTINGS, type BotDifficulty, type RoomSettings } from '@belot/engine';
import { PixelButton, PixelSegmented, PixelToggle } from '@/components/ui';

const TIMERS: RoomSettings['turnTimerSeconds'][] = [15, 30, 45, 60];
const DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard'];

export default function SettingsForm({
  value,
  onChange,
  disabled,
}: {
  value: RoomSettings;
  onChange: (s: RoomSettings) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('online');
  // rooms created by an older server may not carry the field yet
  const difficulty = value.botDifficulty ?? DEFAULT_SETTINGS.botDifficulty;
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) =>
    !disabled && onChange({ ...value, botDifficulty: difficulty, [k]: v });

  return (
    <div className={`flex flex-col gap-4 ${disabled ? 'pointer-events-none opacity-80' : ''}`}>
      <div className="flex flex-col gap-1">
        <PixelToggle
          checked={value.forceHigherCardPlacement}
          onChange={(v) => set('forceHigherCardPlacement', v)}
          label={t('settings.forceHigher')}
        />
        <p className="text-[10px] leading-relaxed text-amber-100/80">
          <span className="text-amber-300">{value.forceHigherCardPlacement ? t('settings.strict') : t('settings.relaxed')}: </span>
          {value.forceHigherCardPlacement ? t('settings.strictHelp') : t('settings.relaxedHelp')}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <PixelToggle
          checked={value.manualAnnounceOnly}
          onChange={(v) => set('manualAnnounceOnly', v)}
          label={t('settings.manualAnnounce')}
        />
        <p className="text-[10px] leading-relaxed text-amber-100/80">
          {value.manualAnnounceOnly ? t('settings.manualHelp') : t('settings.autoHelp')}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs">{t('settings.timer')}</span>
        <div className="flex flex-wrap gap-2">
          {TIMERS.map((s) => (
            <PixelButton
              key={s}
              type="button"
              size="sm"
              variant={value.turnTimerSeconds === s ? 'green' : 'dark'}
              aria-pressed={value.turnTimerSeconds === s}
              onClick={() => set('turnTimerSeconds', s)}
              disabled={disabled}
            >
              {t('settings.seconds', { count: s })}
            </PixelButton>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-xs">{t('settings.botDifficulty')}</span>
        <PixelSegmented<BotDifficulty>
          aria-label={t('settings.botDifficulty')}
          className="flex w-full max-w-sm min-w-0"
          value={difficulty}
          onChange={(d) => set('botDifficulty', d)}
          options={DIFFICULTIES.map((d) => ({ value: d, label: t(`settings.difficulty.${d}`) }))}
        />
        <p className="text-[10px] leading-relaxed text-amber-100/80">
          <span className="text-amber-300">{t(`settings.difficulty.${difficulty}`)}: </span>
          {t(`settings.difficultyHelp.${difficulty}`)}
        </p>
      </div>
    </div>
  );
}

export function SettingsSummary({ value }: { value: RoomSettings }) {
  const { t } = useTranslation('online');
  return (
    <ul className="flex flex-col gap-1 text-[10px] text-amber-100/90">
      <li>
        {t('settings.rules')}: <span className="text-amber-300">{value.forceHigherCardPlacement ? t('settings.strict') : t('settings.relaxed')}</span>
      </li>
      <li>
        {t('settings.announcements')}:{' '}
        <span className="text-amber-300">{value.manualAnnounceOnly ? t('settings.manual') : t('settings.auto')}</span>
      </li>
      <li>
        {t('settings.timer')}: <span className="text-amber-300">{t('settings.seconds', { count: value.turnTimerSeconds })}</span>
      </li>
      <li>
        {t('settings.bots')}:{' '}
        <span className="text-amber-300">{t(`settings.difficulty.${value.botDifficulty ?? DEFAULT_SETTINGS.botDifficulty}`)}</span>
      </li>
    </ul>
  );
}
