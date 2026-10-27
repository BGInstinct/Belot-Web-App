/** Game timing knobs. Tests pass tiny values (≈0) so games run instantly. */
export interface GameTiming {
  /** delay before a bot acts */
  botDelayMs: number;
  /** pause after a trick completes before the next turn is processed (bots wait this long; humans get it added to their deadline) */
  trickPauseMs: number;
  /** short beat between every seat being ready (round-end ready-up) and dealing the next round */
  roundEndDelayMs: number;
  /** round-end ready-up window; humans still not ready when it expires are marked AFK and the next round deals */
  roundReadyTimeoutMs: number;
  /** a room with no connected humans is destroyed after this long */
  emptyRoomTtlMs: number;
  /** milliseconds per `settings.turnTimerSeconds` unit (1000 in production) */
  msPerTimerSecond: number;
}

export const ROUND_READY_TIMEOUT_MS = 60_000;

export const DEFAULT_TIMING: GameTiming = {
  botDelayMs: 700,
  trickPauseMs: 1200,
  roundEndDelayMs: 500,
  roundReadyTimeoutMs: ROUND_READY_TIMEOUT_MS,
  emptyRoomTtlMs: 5 * 60 * 1000,
  msPerTimerSecond: 1000,
};

export const LIMITS = {
  chatMaxLength: 200,
  nameMaxLength: 24,
  idMaxLength: 64,
  /** generic event token bucket per socket */
  eventBurst: 30,
  eventRefillPerSec: 10,
  /** chat token bucket per socket */
  chatBurst: 5,
  chatRefillPerSec: 0.5,
  /** host pause/resume token bucket per socket (each toggle broadcasts to the whole room) */
  pauseBurst: 4,
  pauseRefillPerSec: 0.5,
  maxPayloadBytes: 16 * 1024,
};
