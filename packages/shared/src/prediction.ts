import type { CollisionMap } from "./collision.ts";
import { type Body, type MoveInput, moveBody, moveDirection } from "./movement.ts";

/** A correction longer than this is snapped to instead of eased in. */
export const SNAP_PX = 32;
/** Time constant of easing out a small correction, in ms. */
const SMOOTH_MS = 90;
/** Unacknowledged inputs kept for replay; five seconds of walking. */
const MAX_PENDING = 100;

/**
 * Client-side prediction of the player's own movement. Each tick runs the same step the server
 * runs and remembers the input; when the server reports where it put the player after input
 * `ack`, the inputs it has not seen yet are replayed on top. The simulation is deterministic, so
 * the replay matches and nothing moves; when it does not, the difference is eased out over a few
 * frames, or snapped when it is large.
 */
export class Predictor {
  private readonly pending: MoveInput[] = [];
  private seq = 0;
  /** The predicted body after every input sent so far. */
  body: Body;
  /** The body one tick earlier; drawing moves from here toward `body`. */
  private prev: Body;
  private ox = 0;
  private oy = 0;
  private readonly map: CollisionMap;
  /** Walking speed in pixels per second; the server's value for this player. */
  speed: number;

  constructor(map: CollisionMap, start: Body, speed: number) {
    this.map = map;
    this.speed = speed;
    this.body = start;
    this.prev = start;
  }

  /** Inputs sent and not yet acknowledged. */
  get unacked(): number {
    return this.pending.length;
  }

  /**
   * Advances one tick with the move held now. Returns the input to send, or undefined when the
   * player is standing still: an idle tick changes nothing and costs nothing on the wire.
   */
  tick(mx: number, my: number): MoveInput | undefined {
    this.prev = this.body;
    const [vx, vy] = moveDirection(mx, my);
    if (vx === 0 && vy === 0) return undefined;
    const input: MoveInput = { seq: ++this.seq, mx, my };
    this.pending.push(input);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.body = moveBody(this.map, this.body, mx, my, this.speed);
    return input;
  }

  /**
   * Takes the server's word for where the player stood after input `ack` and replays the rest.
   * Returns how far off the prediction was, in pixels.
   */
  reconcile(server: Body, ack: number): number {
    while (this.pending.length > 0 && (this.pending[0] as MoveInput).seq <= ack)
      this.pending.shift();
    let body = server;
    for (const input of this.pending)
      body = moveBody(this.map, body, input.mx, input.my, this.speed);
    const dx = this.body.x - body.x;
    const dy = this.body.y - body.y;
    const error = Math.sqrt(dx * dx + dy * dy);
    if (error > SNAP_PX) {
      this.ox = 0;
      this.oy = 0;
      this.prev = body;
    } else if (error > 0) {
      // Keep the drawn position where it was; the offset eases it onto the corrected path.
      this.ox += dx;
      this.oy += dy;
      this.prev = { ...this.prev, x: this.prev.x - dx, y: this.prev.y - dy };
    }
    this.body = body;
    return error;
  }

  /**
   * Where to draw the player `alpha` of the way through the current tick, with what is left of
   * the last correction after `dtMs` more of easing.
   */
  draw(alpha: number, dtMs: number): Body {
    const k = Math.exp(-dtMs / SMOOTH_MS);
    this.ox = Math.abs(this.ox * k) < 0.01 ? 0 : this.ox * k;
    this.oy = Math.abs(this.oy * k) < 0.01 ? 0 : this.oy * k;
    const { prev, body } = this;
    return {
      x: prev.x + (body.x - prev.x) * alpha + this.ox,
      y: prev.y + (body.y - prev.y) * alpha + this.oy,
      facing: body.facing,
    };
  }

  /** Starts over from the server's position, as after a reconnect. Sequence numbers keep counting. */
  reset(server: Body): void {
    this.pending.length = 0;
    this.body = server;
    this.prev = server;
    this.ox = 0;
    this.oy = 0;
  }
}
