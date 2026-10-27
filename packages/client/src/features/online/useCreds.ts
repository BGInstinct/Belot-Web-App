import { useCallback } from 'react';
import type { PlayerProfile } from '@belot/engine';
import { getAccessToken, useProfile } from '@/auth/useAuth';
import { useEquippedCosmetics } from '@/skins';
import { useOnline } from './store';

/** Profile (with equipped cosmetics) + async access-token getter, for room:create / room:join. */
export function useCreds() {
  const profile = useProfile();
  const { skinId, backId } = useEquippedCosmetics();
  const full: PlayerProfile = { ...profile, cardSkin: profile.cardSkin ?? skinId, cardBack: profile.cardBack ?? backId };
  const key = JSON.stringify(full);
  const getCreds = useCallback(async () => {
    let token: string | undefined;
    try {
      token = await getAccessToken();
    } catch {
      token = undefined;
    }
    return { profile: JSON.parse(key) as PlayerProfile, token };
  }, [key]);
  return { profile: full, getCreds };
}

/** The id the server knows us by in the current room (falls back to the local profile id). */
export function useMyId(): string {
  const myId = useOnline((s) => s.myId);
  const profile = useProfile();
  return myId ?? profile.id;
}
