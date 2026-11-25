import {
  type Body,
  type Collidable,
  type Facing,
  faceToward,
  MOVE_DEADZONE,
  MOVE_MAX,
  type MoveInput,
  moveBy,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  POS_SCALE,
  Predictor,
  pushOut,
  SNAP_PX,
  TICK_MS,
} from "@guago/shared";

/** A frame gap longer than this (a background tab, a debugger) restarts the tick clock. */
const STALL_MS = 250;
/** Time constant of easing out a small correction, in ms. */
const SMOOTH_MS = 90;

/** The own player as the server last described it, in wire units. */
export interface ServerSelf {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly seq: number;
}

/**
 * The player's own character, answering the keys on the very frame they change.
 *
 * What is drawn is a lead: every frame it walks with the keys held now, by the shared step at
 * that frame's share of the speed. The simulation's 20 Hz ticks follow it: each tick sends the
 * exact distance the lead covered since the last one, as an analog input, and predicts it with
 * the same step the server runs. So the authoritative path retraces the drawn one a tick behind,
 * a key let go stops the drawing at once and the last tick lands where it stopped, and
 * reconciling against the server by sequence number works as before.
 */
export class SelfMover {
  private predictor: Predictor | undefined;
  private seen: ServerSelf | undefined;
  private lead: Body | undefined;
  private ox = 0;
  private oy = 0;
  private acc = 0;
  private readonly map: Collidable;
  private readonly send: (input: MoveInput) => void;
  /** Largest correction seen, for development checks. */
  worstError = 0;
  corrections = 0;

  constructor(map: Collidable, send: (input: MoveInput) => void) {
    this.map = map;
    this.send = send;
  }

  /** Takes in the own player's synced state from a patch. */
  onServer(s: ServerSelf): void {
    const body: Body = { x: s.x / POS_SCALE, y: s.y / POS_SCALE, facing: s.facing as Facing };
    const seen = this.seen;
    this.seen = { ...s };
    const p = this.predictor;
    if (!p) {
      this.predictor = new Predictor(this.map, body, PLAYER_SPEED);
      this.lead = body;
      return;
    }
    if (seen && seen.x === s.x && seen.y === s.y && seen.seq === s.seq && seen.facing === s.facing)
      return;
    const before = p.body;
    const error = p.reconcile(body, s.seq);
    if (error > 0) {
      this.corrections++;
      this.worstError = Math.max(this.worstError, error);
      this.follow(before, p.body);
    }
  }

  /** The predicted body moved from `before` to `after`: the lead moves with it, the drawing eases. */
  private follow(before: Body, after: Body): void {
    const lead = this.lead ?? before;
    const moved = pushOut(
      this.map,
      after.x + (lead.x - before.x),
      after.y + (lead.y - before.y),
      PLAYER_RADIUS,
    );
    const dx = lead.x - moved.x;
    const dy = lead.y - moved.y;
    if (Math.hypot(dx, dy) > SNAP_PX) {
      this.ox = 0;
      this.oy = 0;
    } else {
      this.ox += dx;
      this.oy += dy;
    }
    this.lead = { ...lead, x: moved.x, y: moved.y };
  }

  /** Starts over from the server's last word, as after a reconnect. */
  resync(): void {
    const s = this.seen;
    const p = this.predictor;
    if (!s || !p) return;
    const before = p.body;
    p.reset({ x: s.x / POS_SCALE, y: s.y / POS_SCALE, facing: s.facing as Facing });
    this.follow(before, p.body);
    this.acc = 0;
  }

  get ready(): boolean {
    return this.predictor !== undefined;
  }

  /** The input for the tick now ending: the distance the lead got ahead of the prediction. */
  private nextInput(p: Predictor, lead: Body, mx: number, my: number): MoveInput | undefined {
    const step = (p.speed * TICK_MS) / 1000;
    let qx = Math.round(((lead.x - p.body.x) / step) * MOVE_MAX);
    let qy = Math.round(((lead.y - p.body.y) / step) * MOVE_MAX);
    const len = Math.hypot(qx, qy);
    if (len > MOVE_MAX) {
      qx = Math.trunc((qx * MOVE_MAX) / len);
      qy = Math.trunc((qy * MOVE_MAX) / len);
    }
    if (Math.hypot(qx, qy) < MOVE_DEADZONE) {
      // Nothing to catch up. Pressing into a wall still turns the player, on the server too.
      if ((mx === 0 && my === 0) || faceToward(p.body.facing, mx, my) === p.body.facing) {
        return undefined;
      }
      qx = Math.sign(mx) * MOVE_DEADZONE;
      qy = Math.sign(my) * MOVE_DEADZONE;
    }
    return p.tick(qx, qy);
  }

  /**
   * Draws the lead on with the move held now and runs the ticks due after `dtMs`; returns where
   * to draw the player. While `live` is false (connection dropped) the player stands.
   */
  frame(dtMs: number, move: () => [number, number], live: boolean): Body | undefined {
    const p = this.predictor;
    const lead = this.lead;
    if (!p || !lead) return undefined;
    const [mx, my] = live ? move() : [0, 0];
    this.lead = moveBy(this.map, lead, mx, my, (p.speed * Math.min(dtMs, STALL_MS)) / 1000);
    this.acc += dtMs;
    if (this.acc > STALL_MS) this.acc = TICK_MS;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      // Nothing goes out while the connection is down: the SDK would deliver it after the
      // reconnect, on top of a prediction that has started over.
      const input = live ? this.nextInput(p, this.lead, mx, my) : undefined;
      if (input) this.send(input);
    }
    const k = Math.exp(-dtMs / SMOOTH_MS);
    this.ox = Math.abs(this.ox * k) < 0.01 ? 0 : this.ox * k;
    this.oy = Math.abs(this.oy * k) < 0.01 ? 0 : this.oy * k;
    return { x: this.lead.x + this.ox, y: this.lead.y + this.oy, facing: this.lead.facing };
  }
}
