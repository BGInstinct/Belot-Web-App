import { RANKS, SUITS, cardImagePath, type SkinManifestEntry } from '@/skins';

const done = new Set<string>();

/** Warm the browser cache with all 32 faces + backs + pips of a skin (call before a game starts). */
export function preloadSkin(skin: SkinManifestEntry, extra: string[] = []) {
  const urls = [
    ...SUITS.flatMap((suit) => RANKS.map((rank) => cardImagePath({ suit, rank }, skin))),
    ...skin.backs.map((b) => b.path),
    ...Object.values(skin.suitIcons).map((i) => i.path),
    ...extra,
  ];
  for (const u of urls) {
    if (done.has(u)) continue;
    done.add(u);
    const img = new Image();
    img.src = u;
  }
}
