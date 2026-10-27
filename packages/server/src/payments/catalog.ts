/**
 * Server-side price authority for cosmetic skins.
 * Keep in sync with supabase/migrations/*_skin_catalog seed and
 * packages/client/public/assets/skins/manifest.json (ids).
 * When Supabase is configured, the `skin_catalog` table wins; this list is the fallback.
 */
export interface CatalogItem {
  id: string;
  name: string;
  /** price in minor units; 0 = free for everyone */
  priceCents: number;
  currency: string;
}

export const DEFAULT_CURRENCY = 'EUR';

export const STATIC_CATALOG: CatalogItem[] = [
  { id: 'default', name: 'Classic', priceCents: 0, currency: DEFAULT_CURRENCY },
  { id: 'classic-dark', name: 'Classic Dark', priceCents: 0, currency: DEFAULT_CURRENCY },
  { id: 'fire', name: 'Fire', priceCents: 199, currency: DEFAULT_CURRENCY },
  { id: 'forest', name: 'Forest', priceCents: 199, currency: DEFAULT_CURRENCY },
  { id: 'space', name: 'Space', priceCents: 199, currency: DEFAULT_CURRENCY },
  { id: 'nautical', name: 'Nautical', priceCents: 199, currency: DEFAULT_CURRENCY },
  { id: 'fantasy', name: 'Fantasy', priceCents: 199, currency: DEFAULT_CURRENCY },
  { id: 'deco', name: 'Art Deco', priceCents: 199, currency: DEFAULT_CURRENCY },
  { id: 'geometric', name: 'Geometric', priceCents: 199, currency: DEFAULT_CURRENCY },
];

/** Skins that are free are implicitly owned by everybody (incl. guests). */
export function freeSkinIds(catalog: CatalogItem[]): string[] {
  return catalog.filter((c) => c.priceCents === 0).map((c) => c.id);
}
