/**
 * One headless player (PLAN §26 capacity): signed in, its own body predicted like the browser's,
 * the fight snapshot decoded, and 반자동 play (or full auto, played by the server). Used by the
 * load test and the raid run.
 */
import type { Room } from "@colyseus/sdk";
import { mapById, snapshotReaderForMap } from "@guago/content";
import {
  AIM_MESSAGE,
  type Collidable,
  type Doorway,
  encodeInput,
  type Facing,
  INPUT_MESSAGE,
  type MapState,
  MODE_MESSAGE,
  MOVE_MAX,
  moveBody,
  NULL_SINK,
  POS_SCALE,
  Predictor,
  portalAt,
  Q,
  SNAPSHOT_MESSAGE,
  type SnapshotReader,
  shutDoors,
  TILE_SIZE,
  type WireBoss,
  WirePlayer,
  type WireSelf,
} from "@guago/shared";
import { RaidPlay } from "./raid-play.ts";

export interface Stats {
  bytes: number;
  snapshots: number;
  reconciles: number;
  corrections: number;
  errors: number[];
  downs: number;
}

/** One bot: a session, its own body predicted, and the snapshot decoded. */
export class Bot {
  readonly stats: Stats = {
    bytes: 0,
    snapshots: 0,
    reconciles: 0,
    corrections: 0,
    errors: [],
    downs: 0,
  };
  private predictor: Predictor | undefined;
  /** Made from the room's map on the first snapshot, as the browser does. */
  private reader: SnapshotReader | undefined;
  private seen = { x: -1, y: -1, seq: -1 };
  private slot: string | undefined;
  private dir: readonly [number, number] = [0, 0];
  private until = 0;
  private wasDown = false;
  private goal: [number, number] = [0, 0];
  private goalUntil = 0;
  private lastX = 0;
  private lastY = 0;
  private down = false;
  measuring = false;
  readonly room: Room<unknown, MapState>;
  readonly auto: boolean;
  /** Plays the boss fight's mechanic (`--objectives`), once the map is known. */
  private play: RaidPlay | undefined;
  private readonly plays: number;
  private boss: WireBoss | null = null;
  private aimed = "";
  /** Spots to walk to in order, as a player crossing a building would; empty: fight as usual. */
  route: { x: number; y: number }[] = [];

  constructor(room: Room<unknown, MapState>, auto: boolean, plays = -1) {
    this.room = room;
    this.auto = auto;
    this.plays = plays;
    room.reconnection.enabled = false;
    room.onMessage("*", () => {});
    const sink = {
      ...NULL_SINK,
      self: (me: WireSelf) => this.onSelf(me),
      boss: (b: WireBoss) => {
        this.boss = { ...b };
      },
    };
    room.onMessage(SNAPSHOT_MESSAGE, (bytes: Uint8Array) => {
      if (this.measuring) this.stats.snapshots++;
      this.reader ??= snapshotReaderForMap(room.state.map);
      this.reader.read(bytes, sink);
    });
    const events = room.connection.events;
    const onmessage = events.onmessage;
    events.onmessage = (ev: { data: ArrayBuffer }) => {
      if (this.measuring) this.stats.bytes += ev.data.byteLength;
      onmessage?.(ev);
    };
    room.onStateChange((state) => this.onPatch(state));
    if (auto) room.send(MODE_MESSAGE, [0]);
  }

  get broken(): number {
    return this.reader?.broken ?? 0;
  }

  /** The room's walls as the server has them (doors to unbuilt maps shut), and its doors. */
  private map: Collidable | undefined;
  private doors: readonly Doorway[] = [];
  private speed = 60;

  private onPatch(state: MapState): void {
    if (!this.map && state.map) {
      const def = mapById(state.map);
      if (def) {
        const portals = "portals" in def ? def.portals : [];
        this.doors = portals;
        this.map = { collision: shutDoors(def.collision, portals) };
      }
    }
    let me = this.slot === undefined ? undefined : state.players.get(this.slot);
    if (me?.sid !== this.room.sessionId) {
      me = undefined;
      for (const [slot, p] of state.players) {
        if (p.sid !== this.room.sessionId) continue;
        this.slot = slot;
        me = p;
      }
    }
    if (!me) return;
    this.down = me.down > 0;
    if (this.down && !this.wasDown && this.measuring) this.stats.downs++;
    this.wasDown = this.down;
    this.speed = me.speed || this.speed;
    if (this.predictor) this.predictor.speed = this.speed;
  }

  /** The server's word on the own body, from the snapshot's Self record. */
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
    // In full auto the server walks the body; the browser follows it instead of predicting.
    if (this.auto) {
      this.predictor.reset(body);
      return;
    }
    const error = this.predictor.reconcile(body, me.seq);
    if (!this.measuring) return;
    this.stats.reconciles++;
    if (error > 0) {
      this.stats.corrections++;
      this.stats.errors.push(error);
    }
  }

  /** Walks to the boss mechanic's spot and aims where it says; false when there is none now. */
  private playMechanic(px: number, py: number): boolean {
    if (this.plays < 0 || !this.room.state.map) return false;
    if (!this.play && RaidPlay.plays(this.room.state.map))
      this.play = new RaidPlay(this.room.state.map, this.plays);
    const goal = this.play?.goal(this.boss, this.reader?.members ?? new Map(), px, py);
    const aim = goal?.aim ? `${Math.round(goal.aim.x - px)},${Math.round(goal.aim.y - py)}` : "";
    if (aim !== this.aimed) {
      this.aimed = aim;
      this.room.send(AIM_MESSAGE, aim ? aim.split(",").map(Number) : []);
    }
    if (!goal) return false;
    const dx = goal.x - px;
    const dy = goal.y - py;
    const d = Math.hypot(dx, dy);
    this.dir =
      d <= Math.max(1, goal.near)
        ? [0, 0]
        : [Math.round((dx / d) * MOVE_MAX), Math.round((dy / d) * MOVE_MAX)];
    this.until = 0;
    return true;
  }

  /** 반자동 play: close on the nearest monster, hold a distance, circle; wander when alone. */
  private think(n: number): void {
    const p = this.predictor;
    if (!p) return;
    const px = p.body.x;
    const py = p.body.y;
    const to = this.route[0];
    if (to) {
      const dx = to.x - px;
      const dy = to.y - py;
      const d = Math.hypot(dx, dy);
      if (d <= 3) {
        this.route.shift();
        this.dir = [0, 0];
      } else this.dir = [Math.round((dx / d) * MOVE_MAX), Math.round((dy / d) * MOVE_MAX)];
      this.until = 0;
      return;
    }
    if (this.playMechanic(px, py)) return;
    let best = Number.POSITIVE_INFINITY;
    let mx = 0;
    let my = 0;
    for (const m of this.reader?.members.values() ?? []) {
      if (m.kind >= WirePlayer) continue;
      const dx = m.qx / Q - px;
      const dy = m.qy / Q - py;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        mx = dx;
        my = dy;
      }
    }
    const d = Math.sqrt(best);
    if (d < 220) {
      const ux = mx / (d || 1);
      const uy = my / (d || 1);
      // Too close: back off with a sidestep; too far: walk in; else circle.
      const side = Math.floor(n / 60) % 2 === 0 ? 1 : -1;
      let vx: number;
      let vy: number;
      if (d < 44) {
        vx = -ux - uy * side * 0.5;
        vy = -uy + ux * side * 0.5;
      } else if (d > 90) {
        vx = ux;
        vy = uy;
      } else {
        vx = -uy * side;
        vy = ux * side;
      }
      const len = Math.sqrt(vx * vx + vy * vy) || 1;
      this.dir = [Math.round((vx / len) * MOVE_MAX), Math.round((vy / len) * MOVE_MAX)];
      this.until = n + 6;
      return;
    }
    // Nothing near: walk to a destination anywhere on the field, deep regions included.
    const map = this.map;
    if (!map) return;
    const gx = this.goal[0] - px;
    const gy = this.goal[1] - py;
    const gd = Math.sqrt(gx * gx + gy * gy);
    if (gd < 24 || n >= this.goalUntil) {
      const { w, h, rows } = map.collision;
      for (let tries = 0; tries < 40; tries++) {
        const tx = Math.floor(Math.random() * w);
        const ty = Math.floor(Math.random() * h);
        if (rows[ty]?.[tx] !== ".") continue;
        if (portalAt(this.doors, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE) >= 0) continue;
        this.goal = [(tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE];
        break;
      }
      this.goalUntil = n + 400;
      return;
    }
    // Blocked by something: step aside for a moment.
    if (n >= this.until) {
      this.dir = [Math.round((gx / gd) * MOVE_MAX), Math.round((gy / gd) * MOVE_MAX)];
      const stuck = Math.hypot(px - this.lastX, py - this.lastY) < 1;
      if (stuck) {
        const a = Math.random() * Math.PI * 2;
        this.dir = [Math.round(Math.cos(a) * MOVE_MAX), Math.round(Math.sin(a) * MOVE_MAX)];
        this.until = n + 20;
      }
      this.lastX = px;
      this.lastY = py;
    }
  }

  tick(n: number): void {
    if (this.auto || !this.predictor || this.down) return;
    if (n % 4 === 0 || this.plays >= 0 || this.route.length > 0) this.think(n);
    // A door would take the bot to another map: turn back instead.
    const map = this.map;
    const next = map && moveBody(map, this.predictor.body, this.dir[0], this.dir[1], this.speed);
    if (next && portalAt(this.doors, next.x, next.y) >= 0) {
      this.dir = [-this.dir[0], -this.dir[1]];
      this.until = n + 20;
      this.goalUntil = n;
    }
    const input = this.predictor.tick(this.dir[0], this.dir[1]);
    if (input) this.room.send(INPUT_MESSAGE, encodeInput(input));
  }
}
