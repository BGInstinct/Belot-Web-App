import { useTranslation } from 'react-i18next';
import { useTrackerStore } from './store';

/** Team names with translated defaults ("Ние" / "Вие" in BG). */
export function useTeamNames(): [string, string] {
  const { t } = useTranslation('tracker');
  const names = useTrackerStore((s) => s.teamNames);
  return [names[0].trim() || t('defaultTeamA'), names[1].trim() || t('defaultTeamB')];
}
