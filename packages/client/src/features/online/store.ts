/** Online play store: connection, room, personalised game view, event-driven UI effects, chat. */
import { create } from 'zustand';
import type {
  Announcement,
  Bid,
  ClaimInfo,
  GameAction,
  GameEvent,
  PlayerProfile,
  PlayerView,
  RoomSettings,
  RoomView,
  RoundResult,
  Seat,
  Team,
  Trick,
} from '@belot/engine';
import { getSocket, onSocketCreated, request } from '@/lib/socket';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ChatMessage {
  id: number;
  from: string;
  text: string;
  at: number;
}

export type Bubble =
  | { id: number; seat: Seat; kind: 'bid'; bid: Bid }
  | { id: number; seat: Seat; kind: 'announce'; announcement: Announcement }
  | { id: number; seat: Seat; kind: 'claim'; success: boolean };

export interface QueuedEvent {
  id: number;
  at: number;
  event: GameEvent;
}

/** A completed trick kept on the table briefly so players can see the last card before it is swept. */
export interface TrickHold {
  trick: Trick;
  winner: Seat;
  /** true once the cards should fly to the winner */
  sweeping: boolean;
}

const ROOM_KEY = 'belot:lastRoom';
const BUBBLE_MS = 2600;
/** after a Claim All the round summary waits this long so everyone can see the revealed hand */
export const CLAIM_REVEAL_MS = 2800;
const TRICK_SHOW_MS = 1100;
const TRICK_SWEEP_MS = 450;
const MAX_EVENTS = 200;
const MAX_CHAT = 100;

export function getLastRoomCode(): string | null {
  try {
    return sessionStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}
function setLastRoomCode(code: string | null) {
  try {
    if (code) sessionStorage.setItem(ROOM_KEY, code);
    else sessionStorage.removeItem(ROOM_KEY);
  } catch {
    /* ignore */
  }
}

interface JoinCreds {
  profile: PlayerProfile;
  token?: string;
}

interface OnlineState {
  status: ConnectionStatus;
  /** room code we are (or are trying to be) in */
  code: string | null;
  /** id the server assigned us in the current room (may differ from the local guest id) */
  myId: string | null;
  room: RoomView | null;
  view: PlayerView | null;
  events: QueuedEvent[];
  bubbles: Bubble[];
  trickHold: TrickHold | null;
  roundResult: RoundResult | null;
  /** Claim All of the current round (from the 'claimed' event; the view's `claim` is authoritative when present) */
  claim: ClaimInfo | null;
  /** a round result is being held back while a claim reveal is shown */
  roundResultPending: boolean;
  matchWinner: Team | null;
  chat: ChatMessage[];
  unreadChat: number;
  chatOpen: boolean;
  closedReason: string | null;
  /** last error code from an ack (cleared by clearError) */
  error: string | null;
  joining: boolean;
  /** after a finished match the user chose to go back to the lobby view */
  finishedDismissed: boolean;

  connect: () => void;
  createRoom: (settings: RoomSettings, creds: JoinCreds) => Promise<string>;
  joinRoom: (code: string, creds: JoinCreds) => Promise<void>;
  leaveRoom: () => Promise<void>;
  sit: (seat: Seat) => Promise<void>;
  addBot: (seat: Seat) => Promise<void>;
  removeBot: (seat: Seat) => Promise<void>;
  updateSettings: (settings: RoomSettings) => Promise<void>;
  start: () => Promise<void>;
  act: (action: GameAction) => Promise<boolean>;
  sendChat: (text: string) => Promise<void>;
  /** host: pause / resume the running game */
  pause: (paused: boolean) => Promise<boolean>;
  /** AFK player takes control back (from their next turn) */
  imBack: () => Promise<boolean>;
  /** round-end "Continue" */
  ready: () => Promise<boolean>;
  setChatOpen: (open: boolean) => void;
  dismissRoundResult: () => void;
  setFinishedDismissed: (v: boolean) => void;
  clearError: () => void;
  reset: () => void;
}

let creds: JoinCreds | null = null;
let seq = 1;
let joinInFlight: { code: string; p: Promise<void> } | null = null;
let trickTimers: ReturnType<typeof setTimeout>[] = [];
let claimTimer: ReturnType<typeof setTimeout> | null = null;
function clearClaimTimer() {
  if (claimTimer) clearTimeout(claimTimer);
  claimTimer = null;
}

function errCode(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useOnline = create<OnlineState>()((set, get) => {
  /** wrap a request so failures land in `error` */
  async function guarded<T>(p: Promise<T>): Promise<T | undefined> {
    try {
      return await p;
    } catch (e) {
      set({ error: errCode(e) });
      return undefined;
    }
  }

  type BubbleInput = Bubble extends infer B ? (B extends Bubble ? Omit<B, 'id'> : never) : never;
  function addBubble(b: BubbleInput) {
    const id = seq++;
    set((s) => ({ bubbles: [...s.bubbles.filter((x) => x.seat !== b.seat), { ...b, id } as Bubble] }));
    setTimeout(() => set((s) => ({ bubbles: s.bubbles.filter((x) => x.id !== id) })), BUBBLE_MS);
  }

  function holdTrick(trick: Trick, winner: Seat) {
    trickTimers.forEach(clearTimeout);
    set({ trickHold: { trick, winner, sweeping: false } });
    trickTimers = [
      setTimeout(() => set((s) => (s.trickHold?.trick === trick ? { trickHold: { ...s.trickHold, sweeping: true } } : {})), TRICK_SHOW_MS),
      setTimeout(() => set((s) => (s.trickHold?.trick === trick ? { trickHold: null } : {})), TRICK_SHOW_MS + TRICK_SWEEP_MS),
    ];
  }

  function handleEvents(events: GameEvent[]) {
    const now = Date.now();
    const claimed = events.some((e) => e.type === 'claimed');
    set((s) => ({
      events: [...s.events, ...events.map((event) => ({ id: seq++, at: now, event }))].slice(-MAX_EVENTS),
    }));
    for (const ev of events) {
      switch (ev.type) {
        case 'bid':
          addBubble({ seat: ev.seat, kind: 'bid', bid: ev.bid });
          break;
        case 'announced':
          addBubble({ seat: ev.seat, kind: 'announce', announcement: ev.announcement });
          break;
        case 'trickWon':
          // tricks resolved by a claim are not animated one by one
          if (!claimed) holdTrick(ev.trick, ev.seat);
          break;
        case 'cardPlayed':
          // a new trick started while the previous one is still lingering → drop the hold
          if (get().trickHold?.sweeping) set({ trickHold: null });
          break;
        case 'claimed':
          // the claim resolves the rest of the round at once: no lingering trick, show the reveal instead
          trickTimers.forEach(clearTimeout);
          set({ claim: ev.claim, trickHold: null });
          addBubble({ seat: ev.claim.seat, kind: 'claim', success: ev.claim.success });
          break;
        case 'roundEnded':
          if (claimed) {
            // keep the claimer's revealed hand on screen for a moment before the summary covers the table
            const result = ev.result;
            clearClaimTimer();
            set({ roundResultPending: true });
            claimTimer = setTimeout(() => {
              claimTimer = null;
              const phase = get().view?.phase;
              set({ roundResultPending: false, ...(phase === 'roundEnd' || phase === 'matchEnd' ? { roundResult: result } : {}) });
            }, CLAIM_REVEAL_MS);
          } else set({ roundResult: ev.result });
          break;
        case 'matchEnded':
          set({ matchWinner: ev.winner });
          break;
        default:
          break;
      }
    }
  }

  function bind() {
    onSocketCreated((s) => {
      s.on('connect', () => set({ status: 'connected' }));
      s.on('disconnect', (reason) => set({ status: reason === 'io client disconnect' ? 'disconnected' : 'reconnecting' }));
      s.on('connect_error', () => set((st) => ({ status: st.status === 'connected' ? 'reconnecting' : st.status === 'idle' ? 'connecting' : st.status })));
      s.io.on('reconnect_attempt', () => set({ status: 'reconnecting' }));
      // auto-rejoin after a reconnect — the server restores the seat by profile id
      s.io.on('reconnect', () => {
        const { code } = get();
        if (code && creds) {
          void request('room:join', { code, profile: creds.profile, token: creds.token }).catch((e) => {
            set({ error: errCode(e) });
          });
        }
      });
      s.on('room:state', (room) => {
        if (get().code && room.code !== get().code) return;
        set((st) => ({
          room,
          // a fresh match started → clear stale end-of-match state
          ...(room.status === 'playing' && st.room?.status !== 'playing' ? { matchWinner: null, roundResult: null, claim: null, finishedDismissed: false } : {}),
          ...(room.status === 'lobby' ? { view: null, matchWinner: null, trickHold: null, claim: null } : {}),
        }));
      });
      s.on('game:state', (view) =>
        set((st) => ({
          view,
          // the next round was dealt → close the round summary (it stays open for the whole ready-up phase)
          ...(st.roundResult && st.view?.phase === 'roundEnd' && (view.phase === 'bidding' || view.phase === 'playing') ? { roundResult: null } : {}),
          // a new round (no claim in the view) → forget the previous claim reveal
          ...(st.claim && !view.claim && (view.phase === 'bidding' || view.phase === 'playing') ? { claim: null } : {}),
        })),
      );
      s.on('game:events', handleEvents);
      s.on('chat:message', (m) =>
        set((st) => ({
          chat: [...st.chat, { id: seq++, ...m }].slice(-MAX_CHAT),
          unreadChat: st.chatOpen ? 0 : st.unreadChat + 1,
        })),
      );
      s.on('room:closed', (reason) => {
        setLastRoomCode(null);
        set({ closedReason: reason || 'closed', code: null });
      });
    });
  }
  bind();

  return {
    status: 'idle',
    code: null,
    myId: null,
    room: null,
    view: null,
    events: [],
    bubbles: [],
    trickHold: null,
    roundResult: null,
    claim: null,
    roundResultPending: false,
    matchWinner: null,
    chat: [],
    unreadChat: 0,
    chatOpen: false,
    closedReason: null,
    error: null,
    joining: false,
    finishedDismissed: false,

    connect: () => {
      const s = getSocket();
      if (!s.connected) set({ status: get().status === 'idle' ? 'connecting' : get().status });
      else set({ status: 'connected' });
    },

    createRoom: async (settings, c) => {
      get().connect();
      creds = c;
      const { code, playerId } = await request('room:create', { settings, profile: c.profile, token: c.token });
      setLastRoomCode(code);
      clearClaimTimer();
      set({ code, myId: playerId, closedReason: null, chat: [], events: [], view: null, roundResult: null, claim: null, roundResultPending: false, matchWinner: null });
      return code;
    },

    joinRoom: async (rawCode, c) => {
      const code = rawCode.toUpperCase();
      creds = c;
      if (joinInFlight?.code === code) return joinInFlight.p;
      get().connect();
      const switching = get().code !== code;
      set({
        code,
        joining: true,
        closedReason: null,
        ...(switching ? { room: null, view: null, chat: [], events: [], roundResult: null, claim: null, roundResultPending: false, matchWinner: null, trickHold: null } : {}),
      });
      const p = request('room:join', { code, profile: c.profile, token: c.token })
        .then(({ playerId }) => {
          setLastRoomCode(code);
          set({ myId: playerId });
        })
        .catch((e) => {
          setLastRoomCode(null);
          set({ code: null });
          throw e;
        })
        .finally(() => {
          joinInFlight = null;
          set({ joining: false });
        });
      joinInFlight = { code, p };
      return p;
    },

    leaveRoom: async () => {
      setLastRoomCode(null);
      const had = get().code;
      set({ code: null });
      if (had) await request('room:leave', {}).catch(() => undefined);
      get().reset();
    },

    sit: async (seat) => void (await guarded(request('room:sit', { seat }))),
    addBot: async (seat) => void (await guarded(request('room:addBot', { seat }))),
    removeBot: async (seat) => void (await guarded(request('room:removeBot', { seat }))),
    updateSettings: async (settings) => void (await guarded(request('room:updateSettings', { settings }))),
    start: async () => void (await guarded(request('room:start', {}))),
    act: async (action) => {
      try {
        await request('game:action', { action });
        return true;
      } catch (e) {
        set({ error: errCode(e) });
        return false;
      }
    },
    sendChat: async (text) => {
      const t = text.trim().slice(0, 200);
      if (t) await guarded(request('chat:send', { text: t }));
    },
    pause: async (paused) => (await guarded(request('room:pause', { paused }).then(() => true))) ?? false,
    imBack: async () => (await guarded(request('game:imBack', {}).then(() => true))) ?? false,
    ready: async () => (await guarded(request('game:ready', {}).then(() => true))) ?? false,
    setChatOpen: (open) => set({ chatOpen: open, ...(open ? { unreadChat: 0 } : {}) }),
    dismissRoundResult: () => set({ roundResult: null }),
    setFinishedDismissed: (v) => set({ finishedDismissed: v }),
    clearError: () => set({ error: null }),
    reset: () => {
      trickTimers.forEach(clearTimeout);
      clearClaimTimer();
      set({
        code: null,
        room: null,
        view: null,
        events: [],
        bubbles: [],
        trickHold: null,
        roundResult: null,
        claim: null,
        roundResultPending: false,
        matchWinner: null,
        chat: [],
        unreadChat: 0,
        closedReason: null,
        error: null,
      });
    },
  };
});
