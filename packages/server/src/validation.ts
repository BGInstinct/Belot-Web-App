/**
 * Never trust the client: every payload is parsed into a fresh, minimal object here.
 * Each parser returns the sanitized value or null when invalid.
 */
import {
  DEFAULT_SETTINGS,
  RANKS,
  SUITS,
  type Announcement,
  type AnnouncementType,
  type Bid,
  type BotDifficulty,
  type Card,
  type Contract,
  type GameAction,
  type PlayerProfile,
  type Rank,
  type RoomSettings,
  type Seat,
  type Suit,
} from '@belot/engine';
import { LIMITS } from './config';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

export function cleanText(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > maxLen) return null;
  return s;
}

export function parseSeat(v: unknown): Seat | null {
  return v === 0 || v === 1 || v === 2 || v === 3 ? v : null;
}

export function parseBoolean(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'medium', 'hard'];

/** strict: only the exact strings; missing (older clients) → the default tier */
export function parseBotDifficulty(v: unknown): BotDifficulty | null {
  if (v === undefined) return DEFAULT_SETTINGS.botDifficulty;
  return typeof v === 'string' && (BOT_DIFFICULTIES as readonly string[]).includes(v) ? (v as BotDifficulty) : null;
}

export function parseSettings(v: unknown): RoomSettings | null {
  if (!isObj(v)) return null;
  const { forceHigherCardPlacement, manualAnnounceOnly, turnTimerSeconds } = v;
  if (typeof forceHigherCardPlacement !== 'boolean' || typeof manualAnnounceOnly !== 'boolean') return null;
  if (turnTimerSeconds !== 15 && turnTimerSeconds !== 30 && turnTimerSeconds !== 45 && turnTimerSeconds !== 60) return null;
  const botDifficulty = parseBotDifficulty(v.botDifficulty);
  if (!botDifficulty) return null;
  return { forceHigherCardPlacement, manualAnnounceOnly, turnTimerSeconds, botDifficulty };
}

const ID_RE = /^[A-Za-z0-9_:.-]+$/;
const ASSET_RE = /^[A-Za-z0-9_./:-]+$/;

function optionalAsset(v: unknown, max: number): string | undefined | null {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || v.length > max || !ASSET_RE.test(v)) return null;
  return v;
}

export function parseProfile(v: unknown): PlayerProfile | null {
  if (!isObj(v)) return null;
  if (typeof v.id !== 'string' || v.id.length < 1 || v.id.length > LIMITS.idMaxLength || !ID_RE.test(v.id)) return null;
  if (v.id.startsWith('bot:')) return null; // reserved
  const name = cleanText(v.name, LIMITS.nameMaxLength);
  if (!name) return null;
  const avatar = optionalAsset(v.avatar, 300);
  const cardSkin = optionalAsset(v.cardSkin, 64);
  const cardBack = optionalAsset(v.cardBack, 64);
  if (avatar === null || cardSkin === null || cardBack === null) return null;
  const p: PlayerProfile = { id: v.id, name, isGuest: true };
  if (avatar) p.avatar = avatar;
  if (cardSkin) p.cardSkin = cardSkin;
  if (cardBack) p.cardBack = cardBack;
  return p;
}

export function parseToken(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 && v.length <= 4096 ? v : undefined;
}

const isSuit = (v: unknown): v is Suit => typeof v === 'string' && (SUITS as readonly string[]).includes(v);
const isRank = (v: unknown): v is Rank => typeof v === 'string' && (RANKS as readonly string[]).includes(v);

export function parseCard(v: unknown): Card | null {
  if (!isObj(v) || !isSuit(v.suit) || !isRank(v.rank)) return null;
  return { suit: v.suit, rank: v.rank };
}

export function parseContract(v: unknown): Contract | null {
  if (!isObj(v)) return null;
  if (v.kind === 'NT') return { kind: 'NT' };
  if (v.kind === 'AT') return { kind: 'AT' };
  if (v.kind === 'suit' && isSuit(v.suit)) return { kind: 'suit', suit: v.suit };
  return null;
}

export function parseBid(v: unknown): Bid | null {
  if (!isObj(v)) return null;
  switch (v.kind) {
    case 'pass':
      return { kind: 'pass' };
    case 'contra':
      return { kind: 'contra' };
    case 'recontra':
      return { kind: 'recontra' };
    case 'contract': {
      const contract = parseContract(v.contract);
      return contract ? { kind: 'contract', contract } : null;
    }
    default:
      return null;
  }
}

const ANNOUNCEMENT_TYPES: AnnouncementType[] = ['tierce', 'quarte', 'quint', 'carre', 'belot'];

export function parseAnnouncement(v: unknown): Announcement | null {
  if (!isObj(v)) return null;
  if (typeof v.type !== 'string' || !ANNOUNCEMENT_TYPES.includes(v.type as AnnouncementType)) return null;
  if (!Array.isArray(v.cards) || v.cards.length < 1 || v.cards.length > 8) return null;
  const cards: Card[] = [];
  for (const c of v.cards) {
    const card = parseCard(c);
    if (!card) return null;
    cards.push(card);
  }
  if (typeof v.points !== 'number' || !Number.isFinite(v.points) || v.points < 0 || v.points > 1000) return null;
  if (!isRank(v.highRank)) return null;
  const a: Announcement = { type: v.type as AnnouncementType, cards, points: v.points, highRank: v.highRank };
  if (v.suit !== undefined) {
    if (!isSuit(v.suit)) return null;
    a.suit = v.suit;
  }
  return a;
}

export function parseAction(v: unknown): GameAction | null {
  if (!isObj(v)) return null;
  if (v.type === 'bid') {
    const bid = parseBid(v.bid);
    return bid ? { type: 'bid', bid } : null;
  }
  if (v.type === 'play') {
    const card = parseCard(v.card);
    if (!card) return null;
    const action: GameAction = { type: 'play', card };
    if (v.announcements !== undefined) {
      if (!Array.isArray(v.announcements) || v.announcements.length > 8) return null;
      const anns: Announcement[] = [];
      for (const raw of v.announcements) {
        const a = parseAnnouncement(raw);
        if (!a) return null;
        anns.push(a);
      }
      action.announcements = anns;
    }
    if (v.belot !== undefined) {
      if (typeof v.belot !== 'boolean') return null;
      action.belot = v.belot;
    }
    return action;
  }
  if (v.type === 'claim') {
    // strict: a claim carries no payload — anything extra is rejected
    if (Object.keys(v).some((k) => k !== 'type')) return null;
    return { type: 'claim' };
  }
  return null;
}
