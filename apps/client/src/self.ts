import {
  type Body,
  type CollisionMap,
  type Facing,
  type MoveInput,
  PLAYER_SPEED,
  POS_SCALE,
  Predictor,
  TICK_MS,
} from "@guago/shared";

/** A frame gap longer than this (a background tab, a debugger) restarts the tick clock. */
const STALL_MS = 250;

/** The own player as the server last described it, in wire units. */
export interface ServerSelf {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly seq: number;
}

/**
 * The player's own character: samples the held move at the simulation's 20 Hz, predicts it at
 * once with the shared step, sends it, and reconciles whenever the server's word changes.
 */
export class SelfMover {
  private predictor: Predictor | undefined;
  private seen: ServerSelf | undefined;
  private acc = 0;
  private readonly map: CollisionMap;
  private readonly send: (input: MoveInput) => void;
  /** Largest correction seen, for development checks. */
  worstError = 0;
  corrections = 0;

  constructor(map: CollisionMap, send: (input: MoveInput) => void) {
    this.map = map;
    this.send = send;
  }

  /** Takes in the own player's synced state from a patch. */
  onServer(s: ServerSelf): void {
    const body: Body = { x: s.x / POS_SCALE, y: s.y / POS_SCALE, facing: s.facing as Facing };
    const seen = this.seen;
    this.seen = { ...s };
    if (!this.predictor) {
      this.predictor = new Predictor(this.map, body, PLAYER_SPEED);
      return;
    }
    if (seen && seen.x === s.x && seen.y === s.y && seen.seq === s.seq && seen.facing === s.facing)
      return;
    const error = this.predictor.reconcile(body, s.seq);
    if (error > 0) {
      this.corrections++;
      this.worstError = Math.max(this.worstError, error);
    }
  }

  /** Starts over from the server's last word, as after a reconnect. */
  resync(): void {
    const s = this.seen;
    if (!s || !this.predictor) return;
    this.predictor.reset({ x: s.x / POS_SCALE, y: s.y / POS_SCALE, facing: s.facing as Facing });
    this.acc = 0;
  }

  get ready(): boolean {
    return this.predictor !== undefined;
  }

  /**
   * Runs the ticks due after `dtMs` with the move held now and returns where to draw the
   * player. While `live` is false (connection dropped) nothing is sent and the player stands.
   */
  frame(dtMs: number, move: () => [number, number], live: boolean): Body | undefined {
    const p = this.predictor;
    if (!p) return undefined;
    this.acc += dtMs;
    if (this.acc > STALL_MS) this.acc = TICK_MS;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const [mx, my] = live ? move() : [0, 0];
      const input = p.tick(mx, my);
      if (input) this.send(input);
    }
    return p.draw(this.acc / TICK_MS, dtMs);
  }
}
