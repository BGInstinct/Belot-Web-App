/** Card sprite size in art pixels. */
export const CARD_W = 23;
export const CARD_H = 35;

export interface HandLayout {
  scale: number;
  /** number of cards in each row (top → bottom) */
  rows: number[];
  /** horizontal distance between neighbouring cards in a row (px) */
  step: number;
  /** vertical gap between rows (px) */
  rowGap: number;
  /** headroom above the first row for the selected / hover lift (px) */
  head: number;
  width: number;
  height: number;
}

/** Height a hand of `rows` rows takes at scale `s` (also used to budget the drawer for the largest hand). */
export function handHeight(s: number, rows: number): number {
  return 7 * s + rows * CARD_H * s + (rows - 1) * 2 * s;
}

function fit(n: number, s: number, maxWidth: number): Omit<HandLayout, 'height' | 'width'> | null {
  const w = CARD_W * s;
  if (w > maxWidth) return null;
  for (const rowCount of [1, 2]) {
    const perRow = Math.ceil(Math.max(1, n) / rowCount);
    const room = perRow > 1 ? Math.floor((maxWidth - w) / (perRow - 1)) : 0;
    const step = perRow > 1 ? Math.min(w + s, room) : 0;
    const minStep = rowCount === 1 ? Math.round(w * 0.62) : Math.round(w * 0.8);
    if (perRow > 1 && step < minStep) continue;
    const rows = rowCount === 1 || n <= perRow ? [n] : [perRow, n - perRow];
    return { scale: s, rows, step, rowGap: 2 * s, head: 7 * s };
  }
  return null;
}

/**
 * Largest integer card scale for a portrait phone hand drawer, sized for a full 8-card hand so the cards don't
 * change size between bidding (5 cards) and play.
 * One row if the cards keep ≥ 62% of their width visible (the sprites carry the rank in the corner and the pip
 * in the centre); otherwise two balanced rows, where the cards may only overlap slightly (≥ 80% visible) so each
 * one stays a big tap target.
 */
export function mobileHandScale(maxWidth: number, maxHeight: number, maxScale = 5): number {
  for (let s = maxScale; s > 1; s--) {
    const f = fit(8, s, maxWidth);
    if (f && handHeight(s, f.rows.length) <= maxHeight) return s;
  }
  return 1;
}

/** Row layout of `n` cards at a fixed scale (falls back to a squeezed two-row layout). */
export function mobileHandLayout(n: number, scale: number, maxWidth: number): HandLayout {
  const f = fit(n, scale, maxWidth);
  if (f) return { ...f, width: maxWidth, height: handHeight(scale, f.rows.length) };
  const w = CARD_W * scale;
  const perRow = Math.ceil(n / 2);
  const step = perRow > 1 ? Math.max(2 * scale, Math.floor((maxWidth - w) / (perRow - 1))) : 0;
  return { scale, rows: n <= perRow ? [n] : [perRow, n - perRow], step, rowGap: 2 * scale, head: 7 * scale, width: maxWidth, height: handHeight(scale, 2) };
}
