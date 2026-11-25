import type { Collidable } from "./collision.ts";
import { DODGE, ticks } from "./combat.ts";
import { InputFlag, type RollBody, stepBody } from "./fight/body.ts";
import { type Body, type MoveInput, moveDirection } from "./movement.ts";

/** An input as sent: the move, and the dodge or cast it carries. */
export type FlaggedInput = MoveInput & { readonly flags?: number };

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
  private readonly pending: FlaggedInput[] = [];
  private seq = 0;
  /** The predicted body after every input sent so far, its dodge roll included. */
  body: RollBody;
  /** Ticks between two dodges, the server's value for this player; checked locally. */
  dodgeCooldown = ticks(DODGE.cooldownSeconds);
  private ticks = 0;
  private dodgeAt = 0;
  private readonly map: Collidable;
  /** Walking speed in pixels per second; the server's value for this player. */
  speed: number;

  constructor(map: Collidable, start: Body, speed: number) {
    this.map = map;
    this.speed = speed;
    this.body = rolling(start, 0);
  }

  /** Whether a dodge roll is under way: every tick of it sends an input. */
  get rolling(): boolean {
    return this.body.roll > 0;
  }

  /** Inputs sent and not yet acknowledged. */
  get unacked(): number {
    return this.pending.length;
  }

  /**
   * Advances one tick with the move held now and the flags asked for (a dodge, a manual cast).
   * Returns the input to send, or undefined when the player is standing still with nothing to
   * ask: an idle tick changes nothing and costs nothing on the wire. A roll sends every tick.
   */
  tick(mx: number, my: number, flags = 0): FlaggedInput | undefined {
    this.ticks++;
    let f = flags;
    if (f & InputFlag.Dodge) {
      if (this.body.roll > 0 || this.ticks < this.dodgeAt) f &= ~InputFlag.Dodge;
      else this.dodgeAt = this.ticks + this.dodgeCooldown;
    }
    const [vx, vy] = moveDirection(mx, my);
    if (vx === 0 && vy === 0 && f === 0 && this.body.roll === 0) return undefined;
    const input: FlaggedInput = f ? { seq: ++this.seq, mx, my, flags: f } : { seq: ++this.seq, mx, my };
    this.pending.push(input);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.body = stepBody(this.map, this.body, mx, my, f, this.speed, true);
    return input;
  }

  /**
   * Takes the server's word for where the player stood after input `ack` and replays the rest.
   * Returns how far off the prediction was, in pixels.
   */
  reconcile(server: Body, ack: number, roll = 0): number {
    while (this.pending.length > 0 && (this.pending[0] as FlaggedInput).seq <= ack)
      this.pending.shift();
    // A roll under way at `ack` keeps the direction this client gave it.
    let body: RollBody = { ...rolling(server, roll), rdx: this.body.rdx, rdy: this.body.rdy };
    for (const input of this.pending)
      body = stepBody(this.map, body, input.mx, input.my, input.flags ?? 0, this.speed, true);
    const dx = this.body.x - body.x;
    const dy = this.body.y - body.y;
    this.body = body;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Starts over from the server's position, as after a reconnect. Sequence numbers keep counting. */
  reset(server: Body): void {
    this.pending.length = 0;
    this.body = rolling(server, 0);
  }
}

function rolling(b: Body, roll: number): RollBody {
  return { x: b.x, y: b.y, facing: b.facing, roll, rdx: 0, rdy: 0 };
}
