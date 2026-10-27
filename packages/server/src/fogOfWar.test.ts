/**
 * Fog of war over the real socket.io transport: every message a seat (or a spectator) receives during a
 * full match must only contain cards that seat may legitimately know:
 *   - its own hand (ground truth recorded from the engine deal), and
 *   - cards made public this round: played cards, declared announcements, a Claim All's revealed hand and
 *     its played-out tricks.
 * Any other card (another seat's unrevealed hand, the undealt stock) appearing anywhere in a payload is a leak.
 * `room:state` must contain no cards at all. Bots must only be driven through chooseAutoAction(state, seat)
 * for the seat on turn.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card, GameAction, GameEvent, MatchState, PlayerView, RoomSettings, Seat } from '@belot/engine';
import type { BelotApp } from './app';
import { connect, createRoom, FAST_TIMING, profile, settings, startServer, waitFor, type Client } from './test/helpers';

/** ground truth: per round number, every card each seat ever held this round */
const truth = vi.hoisted(() => ({
  owned: new Map<number, Set<string>[]>(),
  autoCalls: [] as { seat: number; turn: number | null }[],
}));

const key = (c: { suit: string; rank: string }) => `${c.rank}${c.suit}`;

vi.mock('@belot/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@belot/engine')>();
  const record = (m: MatchState) => {
    const sets = truth.owned.get(m.roundNumber) ?? [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
    m.hands.forEach((h, s) => h.forEach((c) => sets[s].add(key(c))));
    truth.owned.set(m.roundNumber, sets);
  };
  return {
    ...real,
    createMatch: (s: RoomSettings, dealer: Seat, rng?: () => number) => {
      const m = real.createMatch(s, dealer, rng);
      record(m);
      return m;
    },
    startNextRound: (st: MatchState, rng?: () => number) => {
      const m = real.startNextRound(st, rng);
      record(m);
      return m;
    },
    applyAction: (st: MatchState, seat: Seat, a: GameAction) => {
      const r = real.applyAction(st, seat, a);
      if (r.events.some((e) => e.type === 'dealtRest')) record(r.state);
      return r;
    },
    chooseAutoAction: (st: MatchState, seat: Seat) => {
      truth.autoCalls.push({ seat, turn: st.turn });
      return real.chooseAutoAction(st, seat);
    },
  };
});

let server: BelotApp | undefined;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await server?.close();
  server = undefined;
});

/** every {suit, rank} object anywhere in a payload, with its JSON path */
function cardsIn(v: unknown, path = '$', out: { card: Card; path: string }[] = []) {
  if (Array.isArray(v)) v.forEach((x, i) => cardsIn(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.suit === 'string' && typeof o.rank === 'string') out.push({ card: o as unknown as Card, path });
    for (const [k, x] of Object.entries(o)) cardsIn(x, `${path}.${k}`, out);
  }
  return out;
}

/** Replays one client's message stream in arrival order and records every leaked card. */
class Observer {
  readonly leaks: string[] = [];
  /** per round: cards made public */
  private publicCards = new Map<number, Set<string>>();
  /** per round: cards this client was shown as its own hand */
  private own = new Map<number, Set<string>>();
  round = 1;
  messages = 0;
  cardsChecked = 0;

  constructor(readonly name: string, readonly seat: Seat | null) {}

  private pub(r: number) {
    let s = this.publicCards.get(r);
    if (!s) this.publicCards.set(r, (s = new Set()));
    return s;
  }
  private mine(r: number) {
    let s = this.own.get(r);
    if (!s) this.own.set(r, (s = new Set()));
    return s;
  }
  private check(round: number, payload: unknown, where: string) {
    for (const { card, path } of cardsIn(payload)) {
      this.cardsChecked++;
      const k = key(card);
      if (!this.pub(round).has(k) && !this.mine(round).has(k)) this.leaks.push(`${this.name}: ${where} ${path} = ${k} (round ${round})`);
    }
  }

  onMessage(event: string, args: unknown[]) {
    this.messages++;
    const payload = args[0];
    if (event === 'room:state' || event === 'chat:message' || event === 'room:closed') {
      const found = cardsIn(args);
      if (found.length) this.leaks.push(`${this.name}: ${event} contains cards ${found.map((f) => f.path).join(', ')}`);
      return;
    }
    if (event === 'game:events') {
      const pub = this.pub(this.round);
      for (const e of payload as GameEvent[]) {
        if (e.type === 'cardPlayed') pub.add(key(e.card));
        else if (e.type === 'announced') e.announcement.cards.forEach((c) => pub.add(key(c)));
        else if (e.type === 'claimed') {
          e.claim.revealed.forEach((c) => pub.add(key(c)));
          e.tricks.forEach((t) => t.plays.forEach((p) => pub.add(key(p.card))));
        }
      }
      this.check(this.round, payload, 'game:events');
      return;
    }
    if (event === 'game:state') {
      const v = payload as PlayerView;
      this.round = v.roundNumber;
      if (v.seat !== this.seat) this.leaks.push(`${this.name}: view for seat ${v.seat}`);
      if (this.seat === null) {
        if (v.hand.length) this.leaks.push(`${this.name}: spectator got a hand`);
      } else {
        // the hand shown must really be this seat's hand (engine ground truth)
        const real = truth.owned.get(v.roundNumber)?.[this.seat];
        for (const c of v.hand) {
          if (!real?.has(key(c))) this.leaks.push(`${this.name}: hand card ${key(c)} is not seat ${this.seat}'s (round ${v.roundNumber})`);
          this.mine(v.roundNumber).add(key(c));
        }
      }
      // previous rounds' history is checked against what was public / own in that round
      const { roundHistory, ...rest } = v;
      roundHistory.forEach((r, i) => this.check(i + 1, r, `game:state.roundHistory[${i}]`));
      this.check(v.roundNumber, rest, 'game:state');
    }
  }
}

function observe(c: Client, name: string, seat: Seat | null): Observer {
  const o = new Observer(name, seat);
  c.onAny((event: string, ...args: unknown[]) => {
    try {
      o.onMessage(event, args);
    } catch (err) {
      o.leaks.push(`${name}: observer crashed on ${event}: ${String(err)}`);
    }
  });
  return o;
}

/**
 * Play legal moves on our turns (never claim) and press Continue at round end. One action per decision
 * point (a turn can produce several game:state messages) and retries when rate limited.
 */
function autoRespond(c: Client, seat: Seat) {
  let done = '';
  const retry = () => {
    done = '';
    setTimeout(() => c.lastView() && act(c.lastView()!), 250);
  };
  const act = (v: PlayerView) => {
    const room = c.lastRoom();
    if (room?.paused || room?.status !== 'playing') return;
    if (v.phase === 'roundEnd') {
      const k = `ready:${v.roundHistory.length}`;
      if (room.roundReady && !room.roundReady.readySeats.includes(seat) && done !== k) {
        done = k;
        void c.emitWithAck('game:ready', {}).then((r) => !r.ok && r.error === 'RATE_LIMITED' && retry());
      }
      return;
    }
    if (v.turn !== seat) return;
    const k = `${v.roundHistory.length}:${v.phase}:${v.bids.length}:${v.handCounts[seat]}`;
    if (done === k) return;
    const action: GameAction | null =
      v.phase === 'bidding' && v.legalBids.length
        ? // open the bidding when nobody has (so rounds actually get played), otherwise pass
          { type: 'bid', bid: (!v.contract && v.legalBids.find((b) => b.kind === 'contract')) || v.legalBids[0] }
        : v.phase === 'playing' && v.legalCards.length
          ? { type: 'play', card: v.legalCards[0] }
          : null;
    if (!action) return;
    done = k;
    void c.emitWithAck('game:action', { action }).then((r) => {
      if (!r.ok && r.error === 'RATE_LIMITED') retry();
    });
  };
  c.on('game:state', act);
}

describe('fog of war over socket.io', () => {
  it.each(['easy', 'medium', 'hard'] as const)(
    'no seat or spectator ever receives another seat’s hidden cards or the stock (bots: %s)',
    async (botDifficulty) => {
      truth.owned.clear();
      truth.autoCalls.length = 0;
      const s = await startServer({ timing: { ...FAST_TIMING, msPerTimerSecond: 1000, roundReadyTimeoutMs: 60_000 } });
      server = s.server;
      const [a, b, spec] = await Promise.all([connect(s.url), connect(s.url), connect(s.url)]);
      clients.push(a, b, spec);
      const obs = [observe(a, 'seat0', 0), observe(b, 'seat1', 1)];
      const code = await createRoom(a, profile('h0'), settings({ botDifficulty }));
      expect((await b.emitWithAck('room:join', { code, profile: profile('h1') })).ok).toBe(true);
      await a.emitWithAck('room:addBot', { seat: 2 });
      await a.emitWithAck('room:addBot', { seat: 3 });
      autoRespond(a, 0);
      autoRespond(b, 1);
      expect((await a.emitWithAck('room:start', {})).ok).toBe(true);
      // spectator joins after the start (cannot take a seat)
      expect((await spec.emitWithAck('room:join', { code, profile: profile('spec') })).ok).toBe(true);
      obs.push(observe(spec, 'spectator', null));

      await waitFor(() => a.rooms.find((r) => r.status === 'finished'), 60_000, 'match end');
      await waitFor(() => spec.lastView()?.phase === 'matchEnd', 2000, 'spectator match end');

      expect(a.lastRoom()!.settings.botDifficulty).toBe(botDifficulty);
      expect(a.lastView()!.roundNumber).toBeGreaterThan(1);
      for (const o of obs) {
        expect(o.leaks, o.name).toEqual([]);
        expect(o.messages).toBeGreaterThan(50);
        expect(o.cardsChecked).toBeGreaterThan(100);
      }
      // bots are only consulted for the seat on turn (never for humans that are not AFK)
      expect(truth.autoCalls.length).toBeGreaterThan(0);
      for (const c of truth.autoCalls) {
        expect(c.seat).toBe(c.turn);
        expect([2, 3]).toContain(c.seat);
      }
    },
    90_000,
  );
});
