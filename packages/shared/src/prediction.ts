import type { Collidable } from "./collision.ts";
import { type Body, type MoveInput, moveBody, moveDirection } from "./movement.ts";

/** A correction longer than this is snapped to instead of eased in. */
export const SNAP_PX = 32;
/** Unacknowledged inputs kept for replay; five seconds of walking. */
const MAX_PENDING = 100;

/**
 * Client-side prediction of the player's own movement. Each tick runs the same step the server
 * runs and remembers the input; when the server reports where it put the player after input
 * `ack`, the inputs it has not seen yet are replayed on top. The simulation is deterministic, so
 * the replay matches and nothing moves; when it does not, the caller eases the difference out of
 * what it draws, or snaps when it is large.
 */
export class Predictor {
  private readonly pending: MoveInput[] = [];
  private seq = 0;
  /** The predicted body after every input sent so far. */
  body: Body;
  private readonly map: Collidable;
  /** Walking speed in pixels per second; the server's value for this player. */
  speed: number;

  constructor(map: Collidable, start: Body, speed: number) {
    this.map = map;
    this.speed = speed;
    this.body = start;
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
    this.body = body;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Starts over from the server's position, as after a reconnect. Sequence numbers keep counting. */
  reset(server: Body): void {
    this.pending.length = 0;
    this.body = server;
  }
}
