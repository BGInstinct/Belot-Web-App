/** OWNED BY payments/auth agent. Current player profile (Google via Supabase, or guest). */
import { useMemo } from 'react';
import type { PlayerProfile } from '@belot/engine';
import { supabase } from '@/lib/supabase';
import { useEquippedCosmetics } from '@/skins';
import { useAuthStore } from './authStore';

export { useAuthStore } from './authStore';
export { isSupabaseEnabled } from '@/lib/supabase';

export function useProfile(): PlayerProfile {
  const user = useAuthStore((s) => s.user);
  const guest = useAuthStore((s) => s.guest);
  const { skinId, backId } = useEquippedCosmetics();
  return useMemo<PlayerProfile>(
    () =>
      user
        ? { id: user.id, name: user.name, avatar: user.avatar, isGuest: false, cardSkin: skinId, cardBack: backId }
        : { id: guest.id, name: guest.name, isGuest: true, cardSkin: skinId, cardBack: backId },
    [user, guest, skinId, backId],
  );
}

/** Supabase access token (refreshed if needed), or undefined for guests. */
export async function getAccessToken(): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? undefined;
}
