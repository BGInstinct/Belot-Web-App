/**
 * Bot tests: no automatic claims, fog of war (source audit + hidden-card reshuffle invariance), public-info
 * inference soundness, bitmask legality, determinism and decision timing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { legalMask, makeEnc, maskOf, toBit } from './bot/bits';
import { viewSeed } from './bot/index';
import { buildKnowledge } from './bot/knowledge';
import { sampleDeal } from './bot/sample';
import { cardId, fullDeck, shuffle } from './cards';
import {
  DEFAULT_SETTINGS,
  applyAction,
  chooseAutoAction,
  chooseBotAction,
  createMatch,
  getLegalBids,
  getLegalCards,
  getPlayerView,
  seededRng,
  startNextRound,
} from './index';
import { legalCardsFor } from './rules';
import { playingState } from './testutil';
import type { BotDifficulty, Card, Contract, MatchState, RoomSettings, Seat } from './types';

const DIFFS: BotDifficulty[] = ['easy', 'medium', 'hard'];
const SRC = dirname(fileURLToPath(import.meta.url));

const withDiff = (s: MatchState, d: BotDifficulty): MatchState => ({ ...s, settings: { ...s.settings, botDifficulty: d } });

/** Decision points (bidding and play) from seeded bot matches, sampled every `every` actions. */
function collectStates(seed: number, settings: RoomSettings, every: number, max: number): MatchState[] {
  const rng = seededRng(seed);
  const pick = seededRng(seed * 31 + 7);
  let s = createMatch(settings, (seed % 4) as Seat, rng);
  const out: MatchState[] = [];
  let steps = 0;
  while (s.phase !== 'matchEnd' && out.length < max && steps < 5000) {
    steps++;
    if (s.phase === 'roundEnd') {
      s = startNextRound(s, rng);
      continue;
    }
    if (pick() < 1 / every) out.push(s);
    s = applyAction(s, s.turn!, chooseAutoAction(s, s.turn!)).state;
  }
  return out;
}

const SETTINGS_VARIANTS: RoomSettings[] = [
  { ...DEFAULT_SETTINGS },
  { ...DEFAULT_SETTINGS, forceHigherCardPlacement: false },
  { ...DEFAULT_SETTINGS, manualAnnounceOnly: true },
  { ...DEFAULT_SETTINGS, forceHigherCardPlacement: false, manualAnnounceOnly: true, botDifficulty: 'easy' },
];

describe('Claim All is never automatic', () => {
  it('chooseAutoAction / chooseBotAction never return a claim (random states, all difficulties, all rule sets)', () => {
    let playing = 0;
    let bidding = 0;
    for (const [vi, settings] of SETTINGS_VARIANTS.entries()) {
      for (let seed = 1; seed <= 12; seed++) {
        for (const s of collectStates(1000 * vi + seed, settings, 4, 60)) {
          const seat = s.turn!;
          if (s.phase === 'playing') playing++;
          else bidding++;
          for (const d of DIFFS) {
            const a = chooseAutoAction(withDiff(s, d), seat);
            expect(a.type).not.toBe('claim');
            if (a.type === 'bid') expect(getLegalBids(s, seat)).toContainEqual(a.bid);
            else if (a.type === 'play') expect(getLegalCards(s, seat).map(cardId)).toContain(cardId(a.card));
            const b = chooseBotAction(getPlayerView(s, seat), d, seededRng(seed));
            expect(b.type).not.toBe('claim');
            // off-turn seats only ever get a pass
            const off = ((seat + 1) % 4) as Seat;
            expect(chooseBotAction(getPlayerView(s, off), d, seededRng(seed)).type).not.toBe('claim');
          }
        }
      }
    }
    expect(playing).toBeGreaterThan(500);
    expect(bidding).toBeGreaterThan(50);
  }, 120_000);

  it('does not claim even when a claim is guaranteed (team holds every top card)', () => {
    let s = playingState({
      contract: { kind: 'suit', suit: 'S' },
      hands: ['JS 9S AS 10S AH AD AC KS', '7H 8H 9H 7D 8D 9D 7C 8C', 'QS 10H KH 10D KD 10C KC QH', '7S 8S JH QD JD QC JC 9C'],
      declarer: 0,
      turn: 0,
      trick: { leader: 0, plays: [] },
    });
    while (s.phase === 'playing') {
      for (const d of DIFFS) expect(chooseAutoAction(withDiff(s, d), s.turn!).type).toBe('play');
      s = applyAction(s, s.turn!, chooseAutoAction(s, s.turn!)).state;
    }
    expect(s.roundHistory.at(-1)!.claim).toBeNull();
  });
});

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('fog of war: source audit', () => {
  const botDir = join(SRC, 'bot');
  const files = readdirSync(botDir).filter((f) => f.endsWith('.ts'));
  it('bot/ exists and has the decision modules', () => {
    expect(files).toEqual(expect.arrayContaining(['index.ts', 'knowledge.ts', 'hard.ts', 'play.ts', 'bidding.ts']));
  });
  for (const f of files) {
    it(`bot/${f} imports no state-reading module and touches no hidden field`, () => {
      const src = stripComments(readFileSync(join(botDir, f), 'utf8'));
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        expect(['../game', '../claim', '../view', '../index', '../autoplay', '../testutil', '..']).not.toContain(imp);
      }
      for (const bad of [/\bMatchState\b/, /\bhands\b/, /\bstock\b/, /isClaimGuaranteed/, /solverFor/, /createClaimSolver/, /getLegalCards/, /getLegalBids/])
        expect(src).not.toMatch(bad);
    });
  }
  it('autoplay.ts only hands the PlayerView to the bot', () => {
    const src = stripComments(readFileSync(join(SRC, 'autoplay.ts'), 'utf8'));
    expect(src).toMatch(/getPlayerView\(state, seat\)/);
    expect(src).not.toMatch(/state\./); // never reads a MatchState field directly
    expect(src).not.toMatch(/claim'/);
  });
});

/** Seats' void suits from public play (failure to follow). */
function publicVoids(s: MatchState): Set<string>[] {
  const v = [0, 1, 2, 3].map(() => new Set<string>());
  for (const t of [...s.tricks, ...(s.currentTrick ? [s.currentTrick] : [])])
    t.plays.forEach((p, i) => {
      if (i > 0 && p.card.suit !== t.plays[0].card.suit) v[p.seat].add(t.plays[0].card.suit);
    });
  return v;
}

/**
 * Re-deal the hidden cards (other seats' hands and the stock) among their holders, preserving every holder's
 * card count and everything public: cards of declared, unplayed announcements stay with their declarer and
 * no card of a suit goes to a seat that publicly showed out of it. (A Markov chain of random consistent swaps.)
 */
function reshuffleHidden(s: MatchState, viewer: Seat, rng: () => number): MatchState {
  const n: MatchState = JSON.parse(JSON.stringify(s));
  const holders: Card[][] = [];
  const seatOf: (Seat | null)[] = [];
  for (const seat of [0, 1, 2, 3] as Seat[])
    if (seat !== viewer) {
      holders.push(n.hands[seat]);
      seatOf.push(seat);
    }
  holders.push(n.stock);
  seatOf.push(null);
  const voids = publicVoids(s);
  const pinned = new Set(n.declared.flatMap((d) => d.announcement.cards.map(cardId)));
  const ok = (c: Card, h: number) => {
    const seat = seatOf[h];
    return seat === null || !voids[seat].has(c.suit);
  };
  for (let k = 0; k < 400; k++) {
    const a = Math.floor(rng() * holders.length);
    const b = Math.floor(rng() * holders.length);
    if (a === b || !holders[a].length || !holders[b].length) continue;
    const i = Math.floor(rng() * holders[a].length);
    const j = Math.floor(rng() * holders[b].length);
    const x = holders[a][i];
    const y = holders[b][j];
    if (pinned.has(cardId(x)) || pinned.has(cardId(y))) continue;
    if (!ok(x, b) || !ok(y, a)) continue;
    holders[a][i] = y;
    holders[b][j] = x;
  }
  return n;
}

describe('fog of war: decisions are invariant under re-dealing the hidden cards', () => {
  it('every difficulty returns the same action for the same rng seed (auto wrapper and direct)', () => {
    let compared = 0;
    let changed = 0;
    for (const [vi, settings] of SETTINGS_VARIANTS.entries()) {
      for (let seed = 1; seed <= 6; seed++) {
        const states = collectStates(5000 + 100 * vi + seed, settings, 6, 25);
        states.forEach((s, si) => {
          const seat = s.turn!;
          const rng = seededRng(seed * 1000 + si);
          for (let r = 0; r < 2; r++) {
            const t = reshuffleHidden(s, seat, rng);
            if (JSON.stringify(t.hands) !== JSON.stringify(s.hands) || JSON.stringify(t.stock) !== JSON.stringify(s.stock)) changed++;
            expect(t.hands[seat]).toEqual(s.hands[seat]);
            expect(getPlayerView(t, seat)).toEqual(getPlayerView(s, seat));
            for (const d of DIFFS) {
              expect(chooseAutoAction(withDiff(t, d), seat)).toEqual(chooseAutoAction(withDiff(s, d), seat));
              expect(chooseBotAction(getPlayerView(t, seat), d, seededRng(77))).toEqual(
                chooseBotAction(getPlayerView(s, seat), d, seededRng(77)),
              );
              compared++;
            }
          }
        });
      }
    }
    expect(compared).toBeGreaterThan(300);
    expect(changed).toBeGreaterThan(compared / 6); // the reshuffle really moved hidden cards
  }, 120_000);

  it('the invariance check has teeth: a bot peeking at hidden hands is caught', () => {
    // canary "cheater": picks the legal card indexed by a hash of the opponents' hands
    const cheat = (s: MatchState, seat: Seat) => {
      const legal = getLegalCards(s, seat);
      const h = JSON.stringify([s.hands[(seat + 1) % 4], s.hands[(seat + 3) % 4]]);
      let x = 0;
      for (let i = 0; i < h.length; i++) x = (x * 31 + h.charCodeAt(i)) >>> 0;
      return legal[x % legal.length];
    };
    let caught = 0;
    for (const s of collectStates(4242, DEFAULT_SETTINGS, 3, 60)) {
      if (s.phase !== 'playing' || getLegalCards(s, s.turn!).length < 2) continue;
      const t = reshuffleHidden(s, s.turn!, seededRng(9));
      if (cardId(cheat(t, s.turn!)) !== cardId(cheat(s, s.turn!))) caught++;
    }
    expect(caught).toBeGreaterThan(5);
  });
});

describe('public-information inference', () => {
  it('inferred voids / obligations and pinned cards are always true of the real hands; samples respect them', () => {
    let checks = 0;
    for (const [vi, settings] of SETTINGS_VARIANTS.entries()) {
      for (let seed = 1; seed <= 8; seed++) {
        for (const s of collectStates(7000 + 100 * vi + seed, settings, 3, 40)) {
          if (s.phase !== 'playing') continue;
          const seat = s.turn!;
          const view = getPlayerView(s, seat);
          const k = buildKnowledge(view);
          for (const o of [0, 1, 2, 3] as Seat[]) {
            if (o === seat) continue;
            const real = maskOf(k.enc, s.hands[o]);
            expect(real & k.forbidden[o]).toBe(0);
            expect(k.fixed[o] & ~real).toBe(0);
            expect(k.counts[o]).toBe(s.hands[o].length);
            checks++;
          }
          const rng = seededRng(seed);
          for (let i = 0; i < 3; i++) {
            const deal = sampleDeal(k, rng);
            expect(deal[seat]).toBe(k.hand);
            let union = 0;
            for (const o of [0, 1, 2, 3]) {
              if (o === seat) continue;
              expect(deal[o] & k.forbidden[o]).toBe(0);
              expect(deal[o] & k.fixed[o]).toBe(k.fixed[o]);
              expect(popcountCards(deal[o])).toBe(s.hands[o].length);
              expect(union & deal[o]).toBe(0);
              union |= deal[o];
            }
            expect(union).toBe(k.unseen);
          }
        }
      }
    }
    expect(checks).toBeGreaterThan(1000);
  }, 60_000);

  it('infers a void from failure to follow and trump exhaustion from failure to ruff', () => {
    // Hearts trump. Seat 1 leads AS; seat 2 (team 0, opponent holds the trick) discards a diamond → seat 2 has
    // no spades AND no hearts (it would have had to ruff).
    const u = playingState({
      contract: { kind: 'suit', suit: 'H' },
      hands: ['7S 8S 9S 10S 7C 8C 9C 10C', 'AS KS QS JS 7D 8D 9D 10D', 'JD QD KD AD JC QC KC AC', 'JH 10H AH KH QH 9H 8H 7H'],
      declarer: 0,
      turn: 1,
      trick: { leader: 1, plays: [] },
      dealer: 0,
    });
    let w = applyAction(u, 1, { type: 'play', card: { suit: 'S', rank: 'A' } }).state;
    w = applyAction(w, 2, { type: 'play', card: { suit: 'D', rank: 'J' } }).state;
    const kw = buildKnowledge(getPlayerView(w, 3));
    const enc = kw.enc;
    const bit = (c: Card) => maskOf(enc, [c]);
    expect(kw.forbidden[2] & bit({ suit: 'S', rank: '7' })).not.toBe(0);
    expect(kw.forbidden[2] & bit({ suit: 'H', rank: '7' })).not.toBe(0);
    expect(kw.forbidden[2] & bit({ suit: 'C', rank: '7' })).toBe(0);
    // seat 3 (partner of the holder? no — opponent of seat 1 is team 0; seat 3 is team 1 = holder's partner)
    w = applyAction(w, 3, { type: 'play', card: { suit: 'H', rank: '7' } }).state; // void in spades, ruffs
    const k0 = buildKnowledge(getPlayerView(w, 0));
    expect(k0.forbidden[3] & bit({ suit: 'S', rank: '7' })).not.toBe(0);
    expect(k0.forbidden[3] & bit({ suit: 'H', rank: 'J' })).toBe(0); // free choice → no trump inference
  });
});

function popcountCards(m: number) {
  let n = 0;
  for (; m !== 0; m &= m - 1) n++;
  return n;
}

describe('bot internals', () => {
  const CONTRACTS: Contract[] = [{ kind: 'suit', suit: 'C' }, { kind: 'suit', suit: 'H' }, { kind: 'NT' }, { kind: 'AT' }];
  it('bitmask legality equals rules.ts legalCardsFor on random positions', () => {
    for (let seed = 1; seed <= 600; seed++) {
      const rng = seededRng(seed);
      const deck = shuffle(fullDeck(), rng);
      const contract = CONTRACTS[seed % 4];
      const strict = seed % 3 !== 0;
      const enc = makeEnc(contract, strict);
      const leader = (seed % 4) as Seat;
      const nPlays = Math.floor(rng() * 4);
      const plays = deck.slice(0, nPlays).map((card, i) => ({ seat: ((leader + i) % 4) as Seat, card }));
      const seat = ((leader + nPlays) % 4) as Seat;
      const hand = deck.slice(4, 4 + 1 + Math.floor(rng() * 8));
      const expected = legalCardsFor(hand, { leader, plays }, contract, strict, seat).map(cardId).sort();
      const m = legalMask(enc, maskOf(enc, hand), plays.map((p) => toBit(enc, p.card)), leader, seat);
      expect(hand.filter((c) => ((m >>> toBit(enc, c)) & 1) === 1).map(cardId).sort()).toEqual(expected);
    }
  });

  it('decisions are deterministic for a given rng and the auto wrapper is deterministic per view', () => {
    for (const s of collectStates(99, DEFAULT_SETTINGS, 5, 30)) {
      const v = getPlayerView(s, s.turn!);
      for (const d of DIFFS) expect(chooseBotAction(v, d, seededRng(5))).toEqual(chooseBotAction(v, d, seededRng(5)));
      expect(viewSeed(v)).toBe(viewSeed(getPlayerView(s, s.turn!)));
    }
  });

  it('hard decisions are fast (worst case logged)', () => {
    let worst = 0;
    let total = 0;
    let n = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (const s of collectStates(300 + seed, { ...DEFAULT_SETTINGS, forceHigherCardPlacement: seed % 2 === 0 }, 2, 80)) {
        const v = getPlayerView(s, s.turn!);
        const t0 = performance.now();
        chooseBotAction(v, 'hard', seededRng(seed));
        const dt = performance.now() - t0;
        worst = Math.max(worst, dt);
        total += dt;
        n++;
      }
    }
    console.log(`hard bot: ${n} decisions, avg ${(total / n).toFixed(2)} ms, worst ${worst.toFixed(1)} ms`);
    expect(worst).toBeLessThan(250); // target < 50 ms; generous bound for loaded CI machines
  }, 60_000);
});
