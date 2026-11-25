import { parseArgs } from "node:util";
import { Client, type Room } from "@colyseus/sdk";
import { mapById } from "@guago/content";
import {
  ENTER_PATH,
  encodeInput,
  type Facing,
  INPUT_MESSAGE,
  MapState,
  MODE_MESSAGE,
  MOVE_MAX,
  NULL_SINK,
  POS_SCALE,
  Predictor,
  Q,
  REVIVE_MESSAGE,
  type Seating,
  SNAP_CELL_TILES,
  SNAPSHOT_MESSAGE,
  SnapshotReader,
  TICK_MS,
  TILE_SIZE,
  WirePlayer,
  type WireSelf,
} from "@guago/shared";
import { signIn } from "./account.ts";

/**
 * Development only: a crowd around one student, for watching and measuring the fight as a player
 * sees it in a busy field. N bots sign in, join the map and stay near the student named by
 * `--follow`, in 반자동: their books fire on their own while they close on the monsters near
 * that student, circle, and come back when they stray. When the student is knocked out, the
 * nearest bots walk over and revive them.
 *
 *   node tools/loadtest/src/crowd.ts --bots 40 --url ws://localhost:2573 --follow 무대수학 --map p1-colonnade
 *
 * Bots enter through `POST /api/enter` like the browser; `--map` seats them on that map when the
 * server runs with ALLOW_MAP_OPTION=1.
 */

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "ws://localhost:2567" },
    bots: { type: "string", default: "40" },
    follow: { type: "string", default: "" },
    accounts: { type: "string", default: "cw" },
    revive: { type: "string", default: "1" },
    map: { type: "string", default: "" },
  },
});

const BOTS = Number(values.bots);
const target = new URL(values.url);
const REVIVE = values.revive !== "0";

/** Bots keep within this of the student, px, each at its own distance. */
const NEAR = 150;
/** Monsters this far from the student are left alone, px. */
const HUNT = 170;

class CrowdBot {
  private predictor: Predictor | undefined;
  private readonly reader = new SnapshotReader();
  private seen = { x: -1, y: -1, seq: -1 };
  private slot: string | undefined;
  private follow = -1;
  private dir: readonly [number, number] = [0, 0];
  private map: ReturnType<typeof mapById>;
  private speed = 60;
  private down = false;
  private reviveAt = 0;
  private readonly ring: number;
  private readonly side: number;
  /** This bot's own place around the student, so the crowd spreads instead of clumping. */
  private readonly angle: number;
  readonly room: Room<unknown, MapState>;

  constructor(room: Room<unknown, MapState>, index: number) {
    this.room = room;
    this.ring = 50 + ((index * 37) % 100);
    this.side = index % 2 === 0 ? 1 : -1;
    this.angle = index * 2.399963;
    room.reconnection.enabled = false;
    room.onMessage("*", () => {});
    const sink = { ...NULL_SINK, self: (me: WireSelf) => this.onSelf(me) };
    room.onMessage(SNAPSHOT_MESSAGE, (bytes: Uint8Array) => this.reader.read(bytes, sink));
    room.onStateChange((state) => this.onPatch(state));
    room.send(MODE_MESSAGE, [1]);
  }

  private onPatch(state: MapState): void {
    if (this.reader.cols === 1 && state.map) {
      this.map = mapById(state.map);
      if (this.map) {
        const cell = SNAP_CELL_TILES * TILE_SIZE;
        this.reader.cols = Math.ceil((this.map.collision.w * TILE_SIZE) / cell);
        this.reader.rows = Math.ceil((this.map.collision.h * TILE_SIZE) / cell);
      }
    }
    this.follow = -1;
    for (const [slot, p] of state.players) {
      if (p.sid === this.room.sessionId) {
        this.slot = slot;
        this.down = p.down > 0;
        this.speed = p.speed || this.speed;
      } else if (p.sid && values.follow && p.name === values.follow) this.follow = Number(slot);
    }
    if (this.predictor) this.predictor.speed = this.speed;
  }

  private onSelf(me: WireSelf): void {
    const body = { x: me.x / POS_SCALE, y: me.y / POS_SCALE, facing: me.facing as Facing };
    if (!this.predictor) {
      if (!this.map) return;
      this.predictor = new Predictor(this.map, body, this.speed);
      this.seen = { x: me.x, y: me.y, seq: me.seq };
      return;
    }
    if (me.x === this.seen.x && me.y === this.seen.y && me.seq === this.seen.seq) return;
    this.seen = { x: me.x, y: me.y, seq: me.seq };
    this.predictor.reconcile(body, me.seq, me.roll);
  }

  /** Where the student is and whether they are down, from the snapshot. */
  private student(): { x: number; y: number; down: boolean } | null {
    if (this.follow < 0) return null;
    for (const m of this.reader.members.values()) {
      if (m.kind === WirePlayer && m.slot === this.follow) {
        return { x: m.qx / Q, y: m.qy / Q, down: (m.state & 4) !== 0 };
      }
    }
    return null;
  }

  private steer(vx: number, vy: number): void {
    const len = Math.hypot(vx, vy);
    this.dir =
      len < 0.01 ? [0, 0] : [Math.round((vx / len) * MOVE_MAX), Math.round((vy / len) * MOVE_MAX)];
  }

  private think(n: number, now: number): void {
    const p = this.predictor;
    if (!p) return;
    const px = p.body.x;
    const py = p.body.y;
    const s = this.student();
    if (!s) {
      this.dir = [0, 0];
      return;
    }
    const sx = s.x - px;
    const sy = s.y - py;
    const sd = Math.hypot(sx, sy);
    // The student is down: the nearest of us walk over and hold E.
    if (s.down && REVIVE) {
      if (sd < 20) {
        this.dir = [0, 0];
        if (now - this.reviveAt > 300) {
          this.reviveAt = now;
          this.room.send(REVIVE_MESSAGE, [this.follow]);
        }
      } else this.steer(sx, sy);
      return;
    }
    if (sd > NEAR + this.ring * 0.4) {
      this.steer(sx, sy);
      return;
    }
    // Hunt the monster nearest this bot's own place among those close to the student.
    const hx = s.x + Math.cos(this.angle) * this.ring;
    const hy = s.y + Math.sin(this.angle) * this.ring * 0.7;
    let best = Number.POSITIVE_INFINITY;
    let mx = 0;
    let my = 0;
    for (const m of this.reader.members.values()) {
      if (m.kind >= WirePlayer) continue;
      const x = m.qx / Q;
      const y = m.qy / Q;
      if (Math.hypot(x - s.x, y - s.y) > HUNT || Math.hypot(x - hx, y - hy) > 70) continue;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < best) {
        best = d;
        mx = x - px;
        my = y - py;
      }
    }
    if (best < Number.POSITIVE_INFINITY) {
      const d = Math.sqrt(best);
      const ux = mx / (d || 1);
      const uy = my / (d || 1);
      const side = (Math.floor(n / 80) % 2 === 0 ? 1 : -1) * this.side;
      if (d < 40) this.steer(-ux - uy * side * 0.6, -uy + ux * side * 0.6);
      else if (d > 90) this.steer(ux, uy);
      else this.steer(-uy * side, ux * side);
      return;
    }
    // Nothing to hunt: drift to this bot's place around the student, which turns slowly.
    const ang = this.angle + n * 0.002 * this.side;
    const gx = s.x + Math.cos(ang) * this.ring - px;
    const gy = s.y + Math.sin(ang) * this.ring * 0.7 - py;
    if (Math.hypot(gx, gy) < 6) this.dir = [0, 0];
    else this.steer(gx, gy);
  }

  tick(n: number, now: number): void {
    if (!this.predictor || this.down) return;
    if (n % 4 === 0) this.think(n, now);
    const input = this.predictor.tick(this.dir[0], this.dir[1]);
    if (input) this.room.send(INPUT_MESSAGE, encodeInput(input));
  }
}

console.log(`crowd: ${BOTS} bots following ${values.follow || "nobody"} at ${values.url}`);
const bots: CrowdBot[] = [];
for (let i = 0; i < BOTS; i++) {
  const cookie = await signIn(`http://${target.host}`, values.accounts, i + 1);
  const res = await fetch(`http://${target.host}${ENTER_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(values.map ? { map: values.map } : {}),
  });
  if (!res.ok) throw new Error(`enter answered ${res.status}`);
  const { seat } = (await res.json()) as Seating;
  const client = new Client(values.url, { headers: { cookie } });
  const room = await client.consumeSeatReservation(seat, MapState);
  bots.push(new CrowdBot(room, i));
}

let n = 0;
const t0 = performance.now();
setInterval(() => {
  const now = performance.now();
  const due = Math.floor((now - t0) / TICK_MS);
  while (n < due) {
    n++;
    for (const bot of bots) bot.tick(n, now);
  }
}, 5);

const leave = async () => {
  await Promise.all(bots.map((b) => b.room.leave().catch(() => {})));
  process.exit(0);
};
process.on("SIGTERM", () => void leave());
process.on("SIGINT", () => void leave());
