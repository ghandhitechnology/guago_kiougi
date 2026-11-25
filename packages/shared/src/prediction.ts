import type { Collidable } from "./collision.ts";
import { stepBody } from "./fight/body.ts";
import { type Body, type MoveInput, moveDirection } from "./movement.ts";

/** A correction longer than this is snapped to instead of eased in. */
export const SNAP_PX = 32;
/** Time constant of easing out a small correction, in ms. */
const SMOOTH_MS = 90;
/** Unacknowledged inputs kept for replay; five seconds of walking. */
const MAX_PENDING = 100;

/** An input sent, with its flags and the roll it left, so a replay rolls exactly as it did. */
interface Sent extends MoveInput {
  readonly flags: number;
  readonly canRoll: boolean;
  readonly roll: number;
  readonly rdx: number;
  readonly rdy: number;
}

/**
 * Client-side prediction of the player's own movement. Each tick runs the same step the server
 * runs and remembers the input; when the server reports where it put the player after input
 * `ack`, the inputs it has not seen yet are replayed on top. The simulation is deterministic, so
 * the replay matches and nothing moves; when it does not, the difference is eased out over a few
 * frames, or snapped when it is large. A dodge roll and a manual cast travel as the input's
 * flags (`fight/body.ts`), and the roll is predicted with the step the server runs.
 */
export class Predictor {
  private readonly pending: Sent[] = [];
  private seq = 0;
  /** The roll in progress after the last input sent: steps left and the step. */
  private roll = 0;
  private rdx = 0;
  private rdy = 0;
  /** The roll the server is in after the last input it acknowledged. */
  private ackRoll = 0;
  private ackRdx = 0;
  private ackRdy = 0;
  /** The predicted body after every input sent so far. */
  body: Body;
  /** The body one tick earlier; drawing moves from here toward `body`. */
  private prev: Body;
  private ox = 0;
  private oy = 0;
  private readonly map: Collidable;
  /** Walking speed in pixels per second; the server's value for this player. */
  speed: number;

  constructor(map: Collidable, start: Body, speed: number) {
    this.map = map;
    this.speed = speed;
    this.body = start;
    this.prev = start;
  }

  /** Inputs sent and not yet acknowledged. */
  get unacked(): number {
    return this.pending.length;
  }

  /** A roll is under way: every tick sends an input until it ends. */
  get rolling(): boolean {
    return this.roll > 0;
  }

  /**
   * Advances one tick with the move held now and any flags (a dodge, a cast). Returns the input
   * to send, or undefined when the player is standing still with nothing to ask: an idle tick
   * changes nothing and costs nothing on the wire. `canRoll` is whether a dodge may start now.
   */
  tick(
    mx: number,
    my: number,
    flags = 0,
    canRoll = true,
  ): (MoveInput & { flags?: number }) | undefined {
    this.prev = this.body;
    const [vx, vy] = moveDirection(mx, my);
    if (vx === 0 && vy === 0 && flags === 0 && this.roll === 0) return undefined;
    const b = stepBody(
      this.map,
      { ...this.body, roll: this.roll, rdx: this.rdx, rdy: this.rdy },
      mx,
      my,
      flags,
      this.speed,
      canRoll,
    );
    this.body = { x: b.x, y: b.y, facing: b.facing };
    this.roll = b.roll;
    this.rdx = b.rdx;
    this.rdy = b.rdy;
    const seq = ++this.seq;
    this.pending.push({ seq, mx, my, flags, canRoll, roll: b.roll, rdx: b.rdx, rdy: b.rdy });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    return flags ? { seq, mx, my, flags } : { seq, mx, my };
  }

  /**
   * Takes the server's word for where the player stood after input `ack` and replays the rest.
   * Returns how far off the prediction was, in pixels.
   */
  reconcile(server: Body, ack: number): number {
    while (this.pending.length > 0 && (this.pending[0] as Sent).seq <= ack) {
      const done = this.pending.shift() as Sent;
      this.ackRoll = done.roll;
      this.ackRdx = done.rdx;
      this.ackRdy = done.rdy;
    }
    let b = { ...server, roll: this.ackRoll, rdx: this.ackRdx, rdy: this.ackRdy };
    for (const input of this.pending)
      b = stepBody(this.map, b, input.mx, input.my, input.flags, this.speed, input.canRoll);
    const body: Body = { x: b.x, y: b.y, facing: b.facing };
    this.roll = b.roll;
    this.rdx = b.rdx;
    this.rdy = b.rdy;
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
    this.roll = 0;
    this.ackRoll = 0;
    this.body = server;
    this.prev = server;
    this.ox = 0;
    this.oy = 0;
  }
}
