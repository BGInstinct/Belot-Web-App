import type { GameAction, PlayerProfile, RoomSettings, Seat } from '@belot/engine';
import { DEFAULT_TIMING, type GameTiming } from '../config';
import { generateRoomCode, normalizeRoomCode } from './codes';
import { Room, RoomError, type RoomTransport } from './Room';

export interface RoomManagerOptions {
  transport: RoomTransport;
  timing?: Partial<GameTiming>;
  rng?: () => number;
  now?: () => number;
  /** called when a socket is detached from a room (left / replaced / room destroyed) so it can leave channels etc. */
  onSocketDetached?: (socketId: string, code: string) => void;
}

/** Owns all rooms and the socket → room index. A socket belongs to at most one room. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private socketRoom = new Map<string, string>();
  readonly timing: GameTiming;

  constructor(private readonly opts: RoomManagerOptions) {
    this.timing = { ...DEFAULT_TIMING, ...opts.timing };
  }

  get(code: string): Room | undefined {
    const c = normalizeRoomCode(code);
    return c ? this.rooms.get(c) : undefined;
  }

  roomOf(socketId: string): Room | undefined {
    const code = this.socketRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  requireRoom(socketId: string): Room {
    const room = this.roomOf(socketId);
    if (!room) throw new RoomError('NOT_IN_ROOM');
    return room;
  }

  create(socketId: string, profile: PlayerProfile, verified: boolean, settings: RoomSettings): Room {
    this.leave(socketId);
    const code = generateRoomCode((c) => this.rooms.has(c));
    const room = new Room(code, profile, settings, {
      transport: this.opts.transport,
      timing: this.timing,
      rng: this.opts.rng,
      now: this.opts.now,
      onDestroy: (r) => this.onRoomDestroyed(r),
    });
    this.rooms.set(code, room);
    this.attach(socketId, room, profile, verified);
    return room;
  }

  join(socketId: string, rawCode: string, profile: PlayerProfile, verified: boolean): Room {
    const code = normalizeRoomCode(rawCode);
    if (!code) throw new RoomError('INVALID_CODE');
    const room = this.rooms.get(code);
    if (!room || room.destroyed) throw new RoomError('ROOM_NOT_FOUND');
    const current = this.roomOf(socketId);
    if (current && current !== room) this.leave(socketId);
    this.attach(socketId, room, profile, verified);
    return room;
  }

  private attach(socketId: string, room: Room, profile: PlayerProfile, verified: boolean): void {
    const { replacedSocketId } = room.join(socketId, profile, verified);
    this.socketRoom.set(socketId, room.code);
    if (replacedSocketId && this.socketRoom.get(replacedSocketId) === room.code) {
      this.socketRoom.delete(replacedSocketId);
      this.opts.transport.emit(replacedSocketId, 'room:closed', 'replaced');
      this.opts.onSocketDetached?.(replacedSocketId, room.code);
    }
  }

  leave(socketId: string): void {
    const room = this.roomOf(socketId);
    this.socketRoom.delete(socketId);
    if (!room) return;
    room.leave(socketId);
    this.opts.onSocketDetached?.(socketId, room.code);
  }

  disconnect(socketId: string): void {
    const room = this.roomOf(socketId);
    this.socketRoom.delete(socketId);
    room?.disconnect(socketId);
  }

  sit(socketId: string, seat: Seat): void {
    this.requireRoom(socketId).sit(socketId, seat);
  }
  addBot(socketId: string, seat: Seat): void {
    this.requireRoom(socketId).addBot(socketId, seat);
  }
  removeBot(socketId: string, seat: Seat): void {
    this.requireRoom(socketId).removeBot(socketId, seat);
  }
  updateSettings(socketId: string, settings: RoomSettings): void {
    this.requireRoom(socketId).updateSettings(socketId, settings);
  }
  start(socketId: string): void {
    this.requireRoom(socketId).start(socketId);
  }
  action(socketId: string, action: GameAction): void {
    this.requireRoom(socketId).action(socketId, action);
  }
  setPaused(socketId: string, paused: boolean): void {
    this.requireRoom(socketId).setPaused(socketId, paused);
  }
  imBack(socketId: string): void {
    this.requireRoom(socketId).imBack(socketId);
  }
  ready(socketId: string): void {
    this.requireRoom(socketId).ready(socketId);
  }
  chat(socketId: string, text: string): void {
    this.requireRoom(socketId).chat(socketId, text);
  }

  private onRoomDestroyed(room: Room): void {
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
    for (const [sid, code] of this.socketRoom) {
      if (code === room.code) {
        this.socketRoom.delete(sid);
        this.opts.onSocketDetached?.(sid, code);
      }
    }
  }

  /** Destroy every room (server shutdown / tests). */
  closeAll(reason = 'server_shutdown'): void {
    for (const room of [...this.rooms.values()]) room.destroy(reason);
  }
}
