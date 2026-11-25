import { POS_SCALE, TILE_SIZE } from "../constants.ts";
import {
  BurstKind,
  ByteWriter,
  DR_EPS,
  DR_EPS_MONSTER,
  Extra,
  emptyFx,
  FxRec,
  Leave,
  Priv,
  Q,
  SelfField,
  SNAP_CELL_TILES,
  type WireFx,
  type WireHit,
  WireMinion,
  WirePlayer,
  writeFx,
} from "./wire.ts";
import { type Effect, Ev, type FightWorld, FxKind, Gone, HitFlag, type Player } from "./world.ts";

const CELL_PX = SNAP_CELL_TILES * TILE_SIZE;
/** An entity counts as in the next cell once it is this far past the edge (as the schema views). */
const HYSTERESIS = 16;
const IDS = 65536;
/** Own hits sent per tick at most; the rest still land, they just are not numbered. */
const MAX_HITS = 48;
/** Kinds that last long enough to be worth sending again to someone who arrives late. */
/** Kinds that can end before their clock runs out (a hit, a bounce, a merge). */
const ENDS_EARLY = new Set<number>([FxKind.Shot, FxKind.Lob, FxKind.EnemyShot, FxKind.Pool]);
/** Half the 480×270 view. */
const VIEW_W = 240;
const VIEW_H = 135;
/** A window takes in a cell this close past the screen's edge, and lets it go this far past. */
const ENTER = 48;
const LEAVE = 80;
/** Bytes of other players' effects a client gets per tick at most (own effects always go). */
const OTHERS_FX_BYTES = 40;
/** Players' effects go to viewers whose screen comes within this of the cell. */
const SCREEN_HALF_W = VIEW_W + 32;
const SCREEN_HALF_H = VIEW_H + 32;
const LASTING = new Set<number>([
  FxKind.Orbit,
  FxKind.Mark,
  FxKind.Wave,
  FxKind.Zone,
  FxKind.Pool,
  FxKind.Trail,
  FxKind.Danger,
]);

interface Cell {
  members: number[];
  next: number[];
  watched: boolean;
  keyed: boolean;
  quiet: boolean;
  deltaAt: number;
  deltaEnd: number;
  keyAt: number;
  keyEnd: number;
  /** Players' effect records for this tick, as [start, end) pairs in `fxOut`; sent to viewers
   * whose screen reaches the cell. */
  fx: number[];
  /** Per players' effect record: owner player index, x, y, fx id, 1 for an end. */
  fxMeta: number[];
  /** Which of them go to the client being assembled. */
  fxPick: Uint8Array;
  /** Effect ids a keyframe of this cell carries. */
  keyFx: number[];
  /** Monsters' tells and shots, and public bursts: sent to every viewer of the cell. */
  danger: number[];
  /** Codes written sparse this tick. */
  sparse: boolean;
  /** Delta in three parts: removals, codes and updates; then arrivals, chosen per viewer, as
   * [id, source cell, full record start, end]; then tells. */
  headEnd: number;
  arrivals: number[];
  tailAt: number;

  /** Bytes of the delta by part, for measuring. */
  parts: number[];
}

/** One client's window on the fight: a rectangle of cells around its player's screen. */
export interface NetViewer {
  /** The world player this client plays, or null before it is seated. */
  player: Player | null;
  /** Window in cells, inclusive; x1 < x0 when there is none. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Last tick's window. */
  lx0: number;
  ly0: number;
  lx1: number;
  ly1: number;
  /** Needs a keyframe of every cell: just joined or reconnected. */
  fresh: boolean;
  /** This tick's merged own hits. */
  readonly hits: WireHit[];
  hitCount: number;
  /** Private records other than hits, encoded. */
  readonly priv: ByteWriter;
  privCount: number;
  /** Players' effects this client was sent and has not seen end, by fx id. */
  readonly sentFx: Uint8Array;
  /** The own body as last sent: x, y (1/POS_SCALE px), facing, seq, hp, shield. */
  readonly self: Float64Array;
  /** Bytes of the last message, for metrics. */
  lastBytes: number;
  /** Bytes sent to this client by part (as `FightNet.sent`), running totals. */
  readonly parts: Float64Array;
}

export function newViewer(): NetViewer {
  return {
    player: null,
    x0: 0,
    y0: 0,
    x1: -1,
    y1: -1,
    lx0: 0,
    ly0: 0,
    lx1: -1,
    ly1: -1,
    fresh: true,
    hits: [],
    hitCount: 0,
    priv: new ByteWriter(512),
    privCount: 0,
    sentFx: new Uint8Array(65536),
    self: new Float64Array(6).fill(-1),
    lastBytes: 0,
    parts: new Float64Array(8),
  };
}

/**
 * The server's half of the wire (PLAN §19): after each step it cuts the world into interest
 * cells of 16×16 tiles, encodes each watched cell once as a dead-reckoned delta against what its
 * viewers already hold (and as a keyframe when someone starts watching it), and assembles each
 * client's message from the nine cells around its player plus its private records.
 */
export class FightNet {
  readonly cols: number;
  readonly rows: number;
  private readonly w: FightWorld;
  private readonly cells: Cell[] = [];
  private readonly qx = new Int32Array(IDS);
  private readonly qy = new Int32Array(IDS);
  private readonly qvx = new Int16Array(IDS);
  private readonly qvy = new Int16Array(IDS);
  private readonly st = new Uint8Array(IDS);
  private readonly hp = new Uint8Array(IDS);
  private readonly status = new Uint16Array(IDS);
  private readonly kind = new Uint8Array(IDS);
  private readonly slot = new Uint8Array(IDS);
  private readonly cellOf = new Int16Array(IDS).fill(-1);
  private readonly prevCell = new Int16Array(IDS).fill(-1);
  private readonly seen = new Int32Array(IDS).fill(-1);
  private readonly tx = new Int32Array(IDS);
  private readonly ty = new Int32Array(IDS);
  /** Last tick's truth, for the velocity a correction carries. */
  private readonly ptx = new Int32Array(IDS);
  private readonly pty = new Int32Array(IDS);
  private readonly tst = new Uint8Array(IDS);
  private readonly thp = new Uint8Array(IDS);
  private readonly tstatus = new Uint16Array(IDS);
  private readonly tflash = new Uint8Array(IDS);
  private readonly leftAt = new Int32Array(IDS).fill(-1);
  private readonly leftWhy = new Uint8Array(IDS);
  private readonly out = new ByteWriter(1 << 16);
  private readonly fxOut = new ByteWriter(1 << 14);
  private readonly msg = new ByteWriter(1 << 13);
  private readonly memberCodes = new Uint8Array(IDS);
  private readonly cands: number[] = [];
  private readonly order: number[] = [];
  private readonly payload = new ByteWriter(1 << 14);
  private readonly staying: number[] = [];
  private readonly gone: number[] = [];
  private readonly arrivals: number[] = [];
  private readonly fxCell = new Map<number, number>();
  private readonly fxRec = emptyFx();
  private readonly viewerOf = new Map<number, NetViewer>();
  readonly viewers = new Set<NetViewer>();
  /** Running totals for metrics. */
  readonly totals = { keyframes: 0, fx: 0, hits: 0, members: 0 };
  /** Bytes sent by part across all messages: removals, codes, updates, arrivals, effects,
   * keyframes, private, headers. */
  readonly sent = [0, 0, 0, 0, 0, 0, 0, 0];

  constructor(w: FightWorld) {
    this.w = w;
    this.cols = Math.max(1, Math.ceil(w.width / CELL_PX));
    this.rows = Math.max(1, Math.ceil(w.height / CELL_PX));
    for (let i = 0; i < this.cols * this.rows; i++) {
      this.cells.push({
        members: [],
        next: [],
        watched: false,
        keyed: false,
        quiet: true,
        deltaAt: 0,
        deltaEnd: 0,
        keyAt: 0,
        keyEnd: 0,
        fx: [],
        fxMeta: [],
        fxPick: new Uint8Array(64),
        keyFx: [],
        danger: [],
        sparse: false,
        headEnd: 0,
        arrivals: [],
        tailAt: 0,

        parts: [0, 0, 0, 0, 0],
      });
    }
  }

  private cellAt(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL_PX)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL_PX)));
    return cy * this.cols + cx;
  }

  /** The cell for (x, y), staying in `prev` while within its edge plus the hysteresis band. */
  private cellWith(prev: number, x: number, y: number): number {
    if (prev >= 0) {
      const cx = prev % this.cols;
      const cy = (prev - cx) / this.cols;
      if (
        x >= cx * CELL_PX - HYSTERESIS &&
        x < (cx + 1) * CELL_PX + HYSTERESIS &&
        y >= cy * CELL_PX - HYSTERESIS &&
        y < (cy + 1) * CELL_PX + HYSTERESIS
      )
        return prev;
    }
    return this.cellAt(x, y);
  }

  private track(
    id: number,
    kind: number,
    slot: number,
    x: number,
    y: number,
    state: number,
    hp: number,
    status: number,
    flash: boolean,
  ): void {
    const fresh = this.seen[id] !== this.w.tick - 1;
    this.seen[id] = this.w.tick;
    this.kind[id] = kind;
    this.slot[id] = slot;
    const qx = Math.round(x * Q);
    const qy = Math.round(y * Q);
    this.ptx[id] = fresh ? qx : (this.tx[id] as number);
    this.pty[id] = fresh ? qy : (this.ty[id] as number);
    this.tx[id] = qx;
    this.ty[id] = qy;
    this.tst[id] = state;
    this.thp[id] = hp;
    this.tstatus[id] = status;
    this.tflash[id] = flash ? 1 : 0;
    const prev = this.cellOf[id] as number;
    this.prevCell[id] = prev;
    const cell = this.cellWith(prev, x, y);
    this.cellOf[id] = cell;
    (this.cells[cell] as Cell).next.push(id);
  }

  /** Encodes this tick. Call once after each step, before any `message`. */
  update(): void {
    const w = this.w;
    const tick = w.tick;
    for (const c of this.cells) {
      c.watched = false;
      c.keyed = false;
      c.next.length = 0;
      c.fx.length = 0;
      c.fxMeta.length = 0;
      c.keyFx.length = 0;
      c.danger.length = 0;
    }
    for (let i = 0; i < w.removedCount; i++) {
      const r = w.removed[i];
      if (!r) continue;
      this.leftAt[r.entity] = tick;
      this.leftWhy[r.entity] = r.reason === Gone.Died ? Leave.Died : Leave.Gone;
    }
    this.viewerOf.clear();
    for (const v of this.viewers) {
      v.hitCount = 0;
      v.priv.reset();
      v.privCount = 0;
      if (v.player?.joined) this.viewerOf.set(v.player.index, v);
      this.place(v);
    }

    // Every entity, by cell.
    for (const m of w.monsters) {
      if (!m.alive) continue;
      const state = m.state | (m.facing === 3 ? 16 : 0) | (m.elite ? 32 : 0);
      // Health bars belong to elites and bosses; a common monster's hits show as numbers.
      const hp =
        m.elite || m.rank > 1
          ? m.hp <= 0
            ? 0
            : Math.max(1, Math.round((m.hp / m.maxHp) * 255))
          : 255;
      this.track(m.entity, m.kind.index, 0, m.x, m.y, state, hp, m.statusMask, m.flash);
    }
    for (const n of w.minions) {
      if (!n.alive) continue;
      const owner = w.players[n.owner] as Player;
      this.track(n.entity, WireMinion, owner.slot, n.x, n.y, n.role, 255, 0, false);
    }
    for (const p of w.players) {
      if (!p.joined) continue;
      const state =
        p.facing |
        (p.down ? 4 : 0) |
        (p.rollLeft > 0 || (p.forceKeep && p.forceTicks > 0) ? 8 : 0) |
        (p.reviver >= 0 ? 16 : 0);
      const hp = p.hp <= 0 ? 0 : Math.max(1, Math.round((p.hp / p.kit.maxHp) * 255));
      this.track(p.entity, WirePlayer, p.slot, p.x, p.y, state, hp, 0, false);
    }

    this.effects();
    this.out.reset();
    for (let c = 0; c < this.cells.length; c++) this.encodeCell(c);
    this.privates();
  }

  /**
   * Moves a viewer's window with its player: the cells its screen overlaps, widened by a margin
   * so what walks into view was already known. An edge moves out as soon as the screen needs
   * it and back in only once it is well clear, so standing on a line never flickers a cell.
   */
  private place(v: NetViewer): void {
    v.lx0 = v.x0;
    v.ly0 = v.y0;
    v.lx1 = v.x1;
    v.ly1 = v.y1;
    const p = v.player;
    if (!p?.joined) {
      v.x1 = v.x0 - 1;
      return;
    }
    const had = v.x1 >= v.x0 && !v.fresh;
    const edge = (at: number) => Math.floor(at / CELL_PX);
    const lo = (old: number, need: number, keep: number, max: number) =>
      Math.max(0, Math.min(max, had ? Math.min(need, Math.max(old, keep)) : need));
    const hi = (old: number, need: number, keep: number, max: number) =>
      Math.max(0, Math.min(max, had ? Math.max(need, Math.min(old, keep)) : need));
    const cm = this.cols - 1;
    const rm = this.rows - 1;
    v.x0 = lo(v.x0, edge(p.x - VIEW_W - ENTER), edge(p.x - VIEW_W - LEAVE), cm);
    v.x1 = hi(v.x1, edge(p.x + VIEW_W + ENTER), edge(p.x + VIEW_W + LEAVE), cm);
    v.y0 = lo(v.y0, edge(p.y - VIEW_H - ENTER), edge(p.y - VIEW_H - LEAVE), rm);
    v.y1 = hi(v.y1, edge(p.y + VIEW_H + ENTER), edge(p.y + VIEW_H + LEAVE), rm);
    for (let cy = v.y0; cy <= v.y1; cy++) {
      for (let cx = v.x0; cx <= v.x1; cx++) {
        const cell = this.cells[cy * this.cols + cx] as Cell;
        cell.watched = true;
        if (!had || !this.wasIn(v, cx, cy)) cell.keyed = true;
      }
    }
  }

  private wasIn(v: NetViewer, cx: number, cy: number): boolean {
    return cx >= v.lx0 && cx <= v.lx1 && cy >= v.ly0 && cy <= v.ly1;
  }

  private encodeCell(c: number): void {
    const cell = this.cells[c] as Cell;
    const tick = this.w.tick;
    const { members, next } = cell;
    const out = this.out;
    // Who stayed, in the old order; who left, and why; who arrived, in the order found.
    const staying = this.staying;
    const gone = this.gone;
    staying.length = 0;
    gone.length = 0;
    for (let i = 0; i < members.length; i++) {
      const id = members[i] as number;
      if (this.seen[id] === tick && this.cellOf[id] === c) {
        staying.push(id);
        continue;
      }
      const why =
        this.seen[id] === tick
          ? Leave.Moved
          : this.leftAt[id] === tick
            ? (this.leftWhy[id] as number)
            : Leave.Gone;
      if (this.seen[id] !== tick) this.cellOf[id] = -1;
      gone.push(i, why);
    }
    const arrivals = this.arrivals;
    arrivals.length = 0;
    for (const id of next) if (this.prevCell[id] !== c) arrivals.push(id);
    cell.deltaAt = out.n;
    if (!cell.watched) {
      // A cell with no viewers keeps its members' perceived state at the truth, so whoever
      // starts watching gets an exact keyframe.
      for (const id of staying) this.snapToTruth(id);
      for (const id of arrivals) this.snapToTruth(id);
    } else {
      const p0 = out.n;
      out.varint(gone.length / 2);
      for (let i = 0; i < gone.length; i += 2) {
        out.varint(((gone[i] as number) << 2) | (gone[i + 1] as number));
      }
      // Codes: dense, two bits a member, or sparse, a gap and a code per changed member,
      // whichever is smaller. Payloads follow in member order either way.
      const codesAt = out.n;
      const codes = this.memberCodes;
      const pay = this.payload;
      pay.reset();
      let changed = 0;
      for (let i = 0; i < staying.length; i++) {
        const code = this.encodeMember(staying[i] as number, pay);
        codes[i] = code;
        if (code !== 0) changed++;
      }
      const dense = (staying.length + 3) >> 2;
      let sparse = 1;
      let last = -1;
      for (let i = 0; i < staying.length; i++) {
        if (codes[i] === 0) continue;
        sparse += (i - last <= 127 ? 1 : 2) + 1;
        last = i;
      }
      cell.sparse = sparse < dense;
      if (cell.sparse) {
        out.varint(changed);
        last = -1;
        for (let i = 0; i < staying.length; i++) {
          const code = codes[i] as number;
          if (code === 0) continue;
          out.varint(i - last - 1);
          out.u8(code);
          last = i;
        }
      } else {
        for (let i = 0; i < dense; i++) {
          let b = 0;
          for (let k = 0; k < 4; k++) b |= ((codes[i * 4 + k] ?? 0) & 3) << (k * 2);
          out.u8(b);
        }
      }
      const p1 = out.n;
      out.bytes(pay.buf.subarray(0, pay.n));
      const p2 = out.n;
      cell.headEnd = out.n;
      // Arrivals: each one's full record, and where it came from. A client that already holds
      // the cell it came from gets its id alone (see `message`).
      const arr = cell.arrivals;
      arr.length = 0;
      for (const id of arrivals) {
        // Something already perceived walks on with its last step, as a transfer does on the
        // client; something new starts at the truth.
        let src = this.prevCell[id] as number;
        if (src >= 0) {
          this.advance(id);
          // Too far off to carry on: everyone gets it afresh.
          if (
            Math.abs((this.qx[id] as number) - (this.tx[id] as number)) > this.eps(id) ||
            Math.abs((this.qy[id] as number) - (this.ty[id] as number)) > this.eps(id) ||
            this.st[id] !== this.tst[id] ||
            this.hp[id] !== this.thp[id] ||
            this.status[id] !== this.tstatus[id]
          ) {
            this.snapToTruth(id);
            src = -1;
          }
        } else this.snapToTruth(id);
        const at = out.n;
        this.writeFull(id);
        arr.push(id, src, at, out.n);
      }
      const p3 = out.n;
      cell.tailAt = out.n;
      out.varint(cell.danger.length / 2);
      for (let i = 0; i < cell.danger.length; i += 2) {
        out.bytes(this.fxOut.buf.subarray(cell.danger[i] as number, cell.danger[i + 1] as number));
      }
      cell.quiet =
        gone.length === 0 && changed === 0 && arrivals.length === 0 && cell.danger.length === 0;
      cell.parts[0] = codesAt - p0;
      cell.parts[1] = p1 - codesAt;
      cell.parts[2] = p2 - p1;
      cell.parts[3] = p3 - p2;
      cell.parts[4] = out.n - p3;
    }
    cell.deltaEnd = out.n;
    const final = cell.next;
    final.length = 0;
    for (const id of staying) final.push(id);
    for (const id of arrivals) final.push(id);
    cell.next = cell.members;
    cell.members = final;
    this.totals.members += final.length;
    if (cell.keyed) {
      cell.keyAt = out.n;
      out.varint(final.length);
      for (const id of final) this.writeFull(id);
      this.lastingFx(c);
      cell.keyEnd = out.n;
      this.totals.keyframes++;
    }
  }

  /** Dead-reckoning threshold for an entity: a minion may be off by two pixels. */
  private eps(id: number): number {
    const k = this.kind[id] as number;
    return k === WireMinion ? DR_EPS * 2 : k === WirePlayer ? DR_EPS : DR_EPS_MONSTER;
  }

  private advance(id: number): void {
    this.qx[id] = (this.qx[id] as number) + (this.qvx[id] as number);
    this.qy[id] = (this.qy[id] as number) + (this.qvy[id] as number);
  }

  private snapToTruth(id: number): void {
    this.qx[id] = this.tx[id] as number;
    this.qy[id] = this.ty[id] as number;
    this.qvx[id] = Math.max(
      -127,
      Math.min(127, (this.tx[id] as number) - (this.ptx[id] as number)),
    );
    this.qvy[id] = Math.max(
      -127,
      Math.min(127, (this.ty[id] as number) - (this.pty[id] as number)),
    );
    this.st[id] = this.tst[id] as number;
    this.hp[id] = this.thp[id] as number;
    this.status[id] = this.tstatus[id] as number;
  }

  /**
   * One staying member's update into `out`; returns its 2-bit code. A member is corrected only
   * when the client's guess (last position plus last step) is off by more than `DR_EPS`; the
   * correction is the step from the last position, which the client then keeps taking, so a
   * steady walk costs nothing until it turns.
   */
  private encodeMember(id: number, out: ByteWriter): number {
    const tx = this.tx[id] as number;
    const ty = this.ty[id] as number;
    const qx = this.qx[id] as number;
    const qy = this.qy[id] as number;
    let px = qx + (this.qvx[id] as number);
    let py = qy + (this.qvy[id] as number);
    let mask = 0;
    let dx = 0;
    let dy = 0;
    const eps = this.eps(id);
    if (Math.abs(tx - px) > eps || Math.abs(ty - py) > eps) {
      dx = tx - qx;
      dy = ty - qy;
      if (Math.abs(dx) <= 127 && Math.abs(dy) <= 127) {
        mask |= Extra.Move;
        this.qvx[id] = dx;
        this.qvy[id] = dy;
      } else {
        mask |= Extra.Abs;
        this.qvx[id] = 0;
        this.qvy[id] = 0;
      }
      px = tx;
      py = ty;
    }
    this.qx[id] = px;
    this.qy[id] = py;
    if (this.st[id] !== this.tst[id]) mask |= Extra.State;
    if (this.hp[id] !== this.thp[id]) mask |= Extra.Hp;
    if (this.status[id] !== this.tstatus[id]) mask |= Extra.Status;
    if (this.tflash[id]) mask |= Extra.Flash;
    if (mask === 0) return 0;
    if (mask === Extra.Move) {
      out.i8(dx);
      out.i8(dy);
      return 1;
    }
    if (mask === Extra.Flash) return 3;
    out.u8(mask);
    if (mask & Extra.State) {
      this.st[id] = this.tst[id] as number;
      out.u8(this.st[id] as number);
    }
    if (mask & Extra.Hp) {
      this.hp[id] = this.thp[id] as number;
      out.u8(this.hp[id] as number);
    }
    if (mask & Extra.Status) {
      this.status[id] = this.tstatus[id] as number;
      out.u16(this.status[id] as number);
    }
    if (mask & Extra.Abs) {
      out.u16(px);
      out.u16(py);
    } else if (mask & Extra.Move) {
      out.i8(dx);
      out.i8(dy);
    }
    return 2;
  }

  private writeFull(id: number): void {
    const out = this.out;
    const kind = this.kind[id] as number;
    const vx = this.qvx[id] as number;
    const vy = this.qvy[id] as number;
    const hp = this.hp[id] as number;
    const status = this.status[id] as number;
    out.u16(id);
    out.u8(kind);
    out.u8((vx !== 0 || vy !== 0 ? 1 : 0) | (hp !== 255 ? 2 : 0) | (status !== 0 ? 4 : 0));
    if (kind >= WirePlayer) out.u8(this.slot[id] as number);
    out.u16(this.qx[id] as number);
    out.u16(this.qy[id] as number);
    out.u8(this.st[id] as number);
    if (vx !== 0 || vy !== 0) {
      out.i8(Math.max(-128, Math.min(127, vx)));
      out.i8(Math.max(-128, Math.min(127, vy)));
    }
    if (hp !== 255) out.u8(hp);
    if (status !== 0) out.u16(status);
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  private ownerEntity(e: Effect): number {
    if (e.owner >= 0) return (this.w.players[e.owner] as Player).entity;
    return e.slot;
  }

  /** Fills the wire record for an effect; `start` is its age relative to now (≤ 0). */
  private describe(e: Effect, f: WireFx): boolean {
    const w = this.w;
    f.fx = e.fx;
    f.kind = e.kind;
    f.owner = this.ownerEntity(e);
    f.def = e.weapon ? e.weapon.book : e.count;
    f.cast = e.cast;
    f.start = e.born - w.tick;
    f.x = e.x;
    f.y = e.y;
    f.angle = e.angle;
    f.radius = e.radius;
    f.length = e.length;
    f.width = e.width;
    f.count = 0;
    f.duration = e.until - e.born;
    f.speed = 0;
    f.tx = 0;
    f.ty = 0;
    f.anchor = 0;
    f.period = 0;
    f.sweep = 0;
    f.spin = 0;
    f.a = 0;
    f.b = 0;
    f.c = 0;
    f.flags = 0;
    f.chain.length = 0;
    f.parents.length = 0;
    const wp = e.weapon;
    switch (e.kind) {
      case FxKind.Shot:
      case FxKind.EnemyShot: {
        const sp = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
        f.angle = Math.atan2(e.vy, e.vx);
        f.speed = sp;
        f.length = e.range;
        f.count = e.bounce;
        return true;
      }
      case FxKind.Lob: {
        const flight = Math.max(1, Math.round(e.range));
        f.tx = e.tx;
        f.ty = e.ty;
        f.duration = flight;
        f.a = (e.gravity * flight * flight) / 8;
        f.radius = wp ? Math.max(wp.impactRadius, e.radius) : e.radius;
        return true;
      }
      case FxKind.Orbit: {
        const anchor = w.players[e.source];
        f.anchor = anchor ? anchor.entity : 0;
        f.count = e.count;
        f.period = (Math.PI * 2) / Math.max(1e-6, e.speed);
        f.sweep = e.length;
        f.spin = e.spin;
        f.width = e.width;
        f.length = 0;
        return true;
      }
      case FxKind.Beam:
        f.length = wp ? wp.length : e.length;
        f.a = wp ? wp.amplitude / Math.max(1, e.count) : 0;
        f.b = wp ? wp.wavelength / Math.max(1, e.count) : 0;
        f.c = wp ? wp.reflect : 0;
        f.count = e.count;
        return true;
      case FxKind.Chain:
        for (let k = 0; k < e.chainCount; k++) {
          const m = w.monsters[e.chain[k] as number];
          f.chain.push(m ? m.entity : 0);
          f.parents.push(e.chainParent[k] as number);
        }
        return true;
      case FxKind.Cone:
        f.count = e.count;
        f.duration = e.interval;
        f.a = e.fireAt - e.born;
        f.anchor = e.follow ? f.owner : 0;
        return true;
      case FxKind.Mark:
        f.a = e.fireAt - e.born;
        f.count = e.repeats;
        f.period = e.interval;
        f.flags = e.count === 1 ? 1 : 0;
        return true;
      case FxKind.Danger:
        f.a = e.fireAt - e.born;
        f.flags = e.count;
        f.def = e.count;
        return true;
      case FxKind.Wave:
        f.speed = e.speed;
        f.duration = e.interval;
        f.a = e.fireAt - e.born;
        f.flags = e.pull > 0 ? 1 : 0;
        return true;
      case FxKind.Zone:
      case FxKind.Pool:
      case FxKind.Trail:
        f.anchor = e.follow ? f.owner : 0;
        f.speed = e.growth;
        f.spin = e.spin;
        f.flags = wp?.allies && e.kind === FxKind.Zone ? 1 : 0;
        return true;
      case FxKind.Dash:
        f.tx = e.tx;
        f.ty = e.ty;
        f.duration = e.range;
        return true;
      default:
        return false;
    }
  }

  private pushFx(
    cell: number,
    begin: number,
    danger: boolean,
    owner = -1,
    x = 0,
    y = 0,
    fx = 0,
    end = 0,
  ): void {
    const c = this.cells[cell] as Cell;
    if (danger) c.danger.push(begin, this.fxOut.n);
    else {
      c.fx.push(begin, this.fxOut.n);
      c.fxMeta.push(owner, x, y, fx, end);
    }
    this.totals.fx++;
  }

  /** This tick's new and ended effects and public bursts, filed by cell. */
  private effects(): void {
    const w = this.w;
    const fo = this.fxOut;
    fo.reset();
    const f = this.fxRec;
    for (let i = 0; i < w.endedCount; i++) {
      const r = w.ended[i];
      if (!r) continue;
      const filed = this.fxCell.get(r.fx);
      if (filed === undefined) continue;
      this.fxCell.delete(r.fx);
      const cell = filed & 0xffff;
      if (!(this.cells[cell] as Cell).watched) continue;
      const at = fo.n;
      fo.u8(FxRec.End);
      fo.u16(r.fx);
      fo.u16(Math.max(0, Math.round(r.x)));
      fo.u16(Math.max(0, Math.round(r.y)));
      this.pushFx(cell, at, filed >= 0x10000, -1, r.x, r.y, r.fx, 1);
    }
    for (const e of w.effects) {
      if (e.born !== w.tick || (!e.alive && e.ended !== w.tick)) continue;
      const anchor = e.kind === FxKind.Orbit ? w.players[e.source] : null;
      const cell = this.cellAt(anchor ? anchor.x : e.x, anchor ? anchor.y : e.y);
      const danger = e.owner < 0;
      // Only what can end before its clock says so is ever ended on the wire.
      if (e.alive && ENDS_EARLY.has(e.kind)) this.fxCell.set(e.fx, cell | (danger ? 0x10000 : 0));
      if (e.owner >= 0) {
        const v = this.viewerOf.get(e.owner);
        if (v) {
          v.priv.u8(Priv.Cast);
          v.priv.u16(e.fx);
          v.priv.u16(e.cast);
          v.privCount++;
        }
      }
      if (!(this.cells[cell] as Cell).watched) continue;
      if (!this.describe(e, f)) continue;
      const at = fo.n;
      writeFx(fo, f);
      this.pushFx(cell, at, danger, e.owner, e.x, e.y, e.fx, 0);
      if (!e.alive && ENDS_EARLY.has(e.kind)) {
        const end = fo.n;
        fo.u8(FxRec.End);
        fo.u16(e.fx);
        fo.u16(Math.max(0, Math.round(e.x)));
        fo.u16(Math.max(0, Math.round(e.y)));
        this.pushFx(cell, end, danger, e.owner, e.x, e.y, e.fx, 1);
      }
    }
    // Public bursts: reactions, Q.E.D., heals, level ups, elites, revives.
    for (let i = 0; i < w.eventCount; i++) {
      const ev = w.events[i];
      if (!ev) continue;
      let kind = -1;
      let x = ev.x;
      let y = ev.y;
      let radius = 16;
      let owner = 0;
      switch (ev.type) {
        case Ev.Reaction: {
          kind = ev.d;
          const r = w.rules.reactions[ev.d];
          radius = r ? Math.max(16, r.radius) : 16;
          owner = (w.players[ev.a] as Player).entity;
          break;
        }
        case Ev.Qed:
          kind = BurstKind.Qed;
          owner = (w.players[ev.a] as Player).entity;
          break;
        case Ev.Heal:
          kind = BurstKind.Heal;
          radius = ev.d;
          owner = ev.c;
          break;
        case Ev.LevelUp:
        case Ev.Revive: {
          const p = w.players[ev.a] as Player;
          kind = ev.type === Ev.LevelUp ? BurstKind.LevelUp : BurstKind.Revive;
          x = p.x;
          y = p.y;
          owner = p.entity;
          break;
        }
        case Ev.Elite: {
          kind = BurstKind.Elite;
          const m = w.monsters.find((q) => q.alive && q.entity === ev.c);
          if (!m) continue;
          x = m.x;
          y = m.y;
          owner = ev.c;
          break;
        }
        default:
          continue;
      }
      const cell = this.cellAt(x, y);
      if (!(this.cells[cell] as Cell).watched) continue;
      const at = fo.n;
      fo.u8(FxRec.Spawn);
      fo.u16(w.allocFx());
      fo.u8(FxKind.Burst);
      fo.u16(owner);
      fo.u8(kind);
      fo.u16(Math.max(0, Math.round(x)));
      fo.u16(Math.max(0, Math.round(y)));
      fo.u8(Math.min(255, Math.round(radius)));
      this.pushFx(cell, at, true);
    }
  }

  /** Lasting effects anchored in a cell, for a keyframe. */
  private lastingFx(c: number): void {
    const w = this.w;
    const out = this.out;
    const countAt = out.n;
    out.u8(0);
    let n = 0;
    const f = this.fxRec;
    for (const e of w.effects) {
      if (!e.alive || !LASTING.has(e.kind) || e.born === w.tick) continue;
      const anchor = e.kind === FxKind.Orbit ? w.players[e.source] : null;
      const at = this.cellAt(anchor ? anchor.x : e.x, anchor ? anchor.y : e.y);
      if (at !== c || !this.describe(e, f)) continue;
      writeFx(out, f);
      (this.cells[c] as Cell).keyFx.push(e.fx);
      n++;
      if (n === 127) break;
    }
    // New ones this tick are in the delta's lists, which a keyed viewer does not read: add them.
    const cell = this.cells[c] as Cell;
    for (const list of [cell.danger, cell.fx]) {
      for (let i = 0; i < list.length && n < 127; i += 2) {
        out.bytes(this.fxOut.buf.subarray(list[i] as number, list[i + 1] as number));
        n++;
      }
    }
    for (let i = 0; i < cell.fxMeta.length; i += 5) {
      if (cell.fxMeta[i + 4] === 0) cell.keyFx.push(cell.fxMeta[i + 3] as number);
    }
    out.setU8(countAt, n);
  }

  // ── Private records ─────────────────────────────────────────────────────

  private privates(): void {
    const w = this.w;
    for (const v of this.viewers) {
      const p = v.player;
      if (!p?.joined) continue;
      const me = v.self;
      const x = Math.round(p.x * POS_SCALE);
      const y = Math.round(p.y * POS_SCALE);
      let mask = 0;
      if (v.fresh || me[0] !== x || me[1] !== y || me[2] !== p.facing || me[3] !== p.seq) {
        const dx = x - (me[0] as number);
        const dy = y - (me[1] as number);
        const ds = p.seq - (me[3] as number);
        const small =
          !v.fresh && Math.abs(dx) <= 127 && Math.abs(dy) <= 127 && ds >= 0 && ds <= 255;
        mask |= small ? SelfField.Step : SelfField.Body;
      }
      const hp = Math.fround(p.hp);
      const shield = Math.fround(p.shield);
      if (v.fresh || me[4] !== hp) mask |= SelfField.Hp;
      if (v.fresh || me[5] !== shield) mask |= SelfField.Shield;
      if (mask === 0) continue;
      const out = v.priv;
      out.u8(Priv.Self);
      out.u8(mask);
      if (mask & SelfField.Body) {
        out.u16(x);
        out.u16(y);
        out.u8(p.facing);
        out.u32(p.seq);
      } else if (mask & SelfField.Step) {
        out.i8(x - (me[0] as number));
        out.i8(y - (me[1] as number));
        out.u8(p.facing);
        out.u8(p.seq - (me[3] as number));
      }
      if (mask & (SelfField.Body | SelfField.Step)) {
        me[0] = x;
        me[1] = y;
        me[2] = p.facing;
        me[3] = p.seq;
      }
      if (mask & SelfField.Hp) {
        out.f32(hp);
        me[4] = hp;
      }
      if (mask & SelfField.Shield) {
        out.f32(shield);
        me[5] = shield;
      }
      v.privCount++;
    }
    for (let i = 0; i < w.eventCount; i++) {
      const ev = w.events[i];
      if (!ev) continue;
      if (ev.type === Ev.Phase) {
        for (const v of this.viewers) this.note(v, Priv.Phase, ev.d, 0, 0);
        continue;
      }
      const v = this.viewerOf.get(ev.a);
      if (!v) continue;
      switch (ev.type) {
        case Ev.Hit:
          this.mergeHit(v, ev.c, ev.d, ev.e, ev.f, ev.x, ev.y);
          break;
        case Ev.Hurt:
          v.priv.u8(Priv.Hurt);
          v.priv.u16(ev.c);
          v.priv.f32(ev.d);
          v.priv.u8(ev.e & 0xff);
          v.privCount++;
          break;
        case Ev.Collect:
          v.priv.u8(Priv.Collect);
          v.priv.u16(ev.b);
          v.privCount++;
          break;
        case Ev.LevelUp:
          this.note(v, Priv.LevelUp, ev.d, 0, 0);
          break;
        case Ev.Merit:
          this.note(v, Priv.Merit, 1, 0, 0);
          break;
        case Ev.Roll:
          this.note(v, Priv.Roll, Math.round(ev.x * 100), Math.round(ev.y * 100), 0);
          break;
        case Ev.Down:
          this.note(v, Priv.Down, 0, 0, 0);
          break;
        case Ev.Revive:
          this.note(v, Priv.Revive, ev.b, 0, 0);
          break;
        case Ev.Wake:
          this.note(v, Priv.Wake, 0, 0, 0);
          break;
      }
    }
    for (const k of w.pickups) {
      if (!k.alive || k.born !== w.tick || !k.drop) continue;
      const v = this.viewerOf.get(k.owner);
      if (v) this.dropRecord(v, k.id, k.drop.kind, k.x, k.y, k.fromX, k.fromY);
    }
  }

  private note(v: NetViewer, type: number, a: number, b: number, c: number): void {
    v.priv.u8(type);
    v.priv.i16(a);
    v.priv.i16(b);
    v.priv.i16(c);
    v.privCount++;
  }

  private dropRecord(
    v: NetViewer,
    id: number,
    kind: number,
    x: number,
    y: number,
    fx: number,
    fy: number,
  ) {
    const p = v.priv;
    p.u8(Priv.Drop);
    p.u16(id);
    p.u8(kind);
    p.u16(Math.round(x));
    p.u16(Math.round(y));
    p.u16(Math.round(fx));
    p.u16(Math.round(fy));
    v.privCount++;
  }

  /** Rapid hits on one target in a tick become one record with their sum (PLAN §6 merges). */
  private mergeHit(
    v: NetViewer,
    target: number,
    amount: number,
    flags: number,
    cast: number,
    kx: number,
    ky: number,
  ): void {
    for (let i = 0; i < v.hitCount; i++) {
      const h = v.hits[i] as WireHit;
      if (h.target !== target) continue;
      if (amount > h.amount / h.count) h.cast = cast;
      h.amount += amount;
      h.flags |= flags & 0xff;
      h.proof = Math.max(h.proof, (flags >> 12) & 15);
      h.kx = kx;
      h.ky = ky;
      h.count++;
      return;
    }
    if (v.hitCount >= MAX_HITS) return;
    let h = v.hits[v.hitCount];
    if (!h) {
      h = { target: 0, amount: 0, flags: 0, slot: 0, proof: 0, cast: 0, kx: 0, ky: 0, count: 0 };
      v.hits.push(h);
    }
    v.hitCount++;
    h.target = target;
    h.amount = amount;
    h.flags = flags & 0xff;
    h.slot = (flags >> 8) & 15;
    h.proof = (flags >> 12) & 15;
    h.cast = cast;
    h.kx = kx;
    h.ky = ky;
    h.count = 1;
  }

  /**
   * The message for one client this tick: header, the window, a status nibble per cell (2 bits
   * quiet / delta / keyframe, 1 bit players' effects follow), the cells' blocks, then private
   * records. The bytes are valid until the next call.
   */
  message(v: NetViewer): Uint8Array {
    const m = this.msg;
    m.reset();
    const priv = v.hitCount + v.privCount;
    m.u8(priv > 0 ? 1 : 0);
    m.u16(this.w.tick & 0xffff);
    const p = v.player;
    if (!p || v.x1 < v.x0) {
      m.u8(0);
      m.u8(0);
      m.u8(0);
      m.u8(0);
    } else {
      const w = v.x1 - v.x0 + 1;
      const h = v.y1 - v.y0 + 1;
      m.u8(v.x0);
      m.u8(v.y0);
      m.u8(w);
      m.u8(h);
      const statusAt = m.n;
      const n = w * h;
      for (let i = 0; i < (n + 1) >> 1; i++) m.u8(0);
      const had = !v.fresh && v.lx1 >= v.lx0;
      this.pickFx(v, p, had);
      let i = 0;
      for (let cy = v.y0; cy <= v.y1; cy++) {
        for (let cx = v.x0; cx <= v.x1; cx++, i++) {
          const cell = this.cells[cy * this.cols + cx] as Cell;
          let status: number;
          if (!had || !this.wasIn(v, cx, cy)) {
            status = 2;
            m.bytes(this.out.buf.subarray(cell.keyAt, cell.keyEnd));
            for (const fx of cell.keyFx) v.sentFx[fx] = 1;
            this.add(v, 5, cell.keyEnd - cell.keyAt);
          } else {
            if (cell.quiet) status = 0;
            else {
              status = cell.sparse ? 9 : 1;
              const buf = this.out.buf;
              m.bytes(buf.subarray(cell.deltaAt, cell.headEnd));
              const arr = cell.arrivals;
              const n = arr.length / 4;
              const before = m.n;
              m.varint(n);
              const bitsAt = m.n;
              for (let k = 0; k < (n + 7) >> 3; k++) m.u8(0);
              for (let k = 0; k < n; k++) {
                const src = arr[k * 4 + 1] as number;
                if (
                  src >= 0 &&
                  this.wasIn(v, src % this.cols, (src - (src % this.cols)) / this.cols)
                ) {
                  m.buf[bitsAt + (k >> 3)] = (m.buf[bitsAt + (k >> 3)] as number) | (1 << (k & 7));
                  m.u16(arr[k * 4] as number);
                } else {
                  m.bytes(buf.subarray(arr[k * 4 + 2] as number, arr[k * 4 + 3] as number));
                }
              }
              this.add(v, 3, m.n - before);
              m.bytes(buf.subarray(cell.tailAt, cell.deltaEnd));
              for (const k of [0, 1, 2, 4]) this.add(v, k, cell.parts[k] as number);
            }
            const picked = this.pickedIn(cell);
            if (picked > 0) {
              status |= 4;
              const before = m.n;
              m.varint(picked);
              const fo = this.fxOut.buf;
              for (let k = 0; k < cell.fx.length / 2; k++) {
                if (!cell.fxPick[k]) continue;
                m.bytes(fo.subarray(cell.fx[k * 2] as number, cell.fx[k * 2 + 1] as number));
                const id = cell.fxMeta[k * 5 + 3] as number;
                v.sentFx[id] = cell.fxMeta[k * 5 + 4] === 1 ? 0 : 1;
              }
              this.add(v, 4, m.n - before);
            }
          }
          const at = statusAt + (i >> 1);
          m.buf[at] = (m.buf[at] as number) | (status << ((i & 1) * 4));
        }
      }
    }
    if (priv > 0) {
      m.varint(priv);
      for (let i = 0; i < v.hitCount; i++) {
        const h = v.hits[i] as WireHit;
        m.u8(Priv.Hit);
        m.u16(h.target);
        m.f32(h.amount);
        m.u8(h.flags);
        m.u8((h.slot & 15) | ((h.proof & 15) << 4));
        m.u16(h.cast);
        m.i8(Math.max(-128, Math.min(127, Math.round(h.kx * Q))));
        m.i8(Math.max(-128, Math.min(127, Math.round(h.ky * Q))));
        m.u8(Math.min(255, h.count));
      }
      m.bytes(v.priv.buf.subarray(0, v.priv.n));
      this.totals.hits += v.hitCount;
      this.add(v, 6, v.hitCount * 14 + v.priv.n + 1);
    }
    v.fresh = false;
    v.lastBytes = m.n;
    this.add(v, 7, 7 + 4);
    return m.buf.subarray(0, m.n);
  }

  private pickedIn(cell: Cell): number {
    let n = 0;
    for (let k = 0; k < cell.fx.length / 2; k++) if (cell.fxPick[k]) n++;
    return n;
  }

  /**
   * Chooses the players' effects a client gets this tick, from the cells it holds that its screen
   * reaches: all of its own, every end of something it was sent, and others' spawns nearest
   * first up to `OTHERS_FX_BYTES`. In a crowd of eighty the far casts are the ones it loses.
   */
  private pickFx(v: NetViewer, p: Player, had: boolean): void {
    const cands = this.cands;
    cands.length = 0;
    for (let cy = v.y0; cy <= v.y1; cy++) {
      for (let cx = v.x0; cx <= v.x1; cx++) {
        const c = cy * this.cols + cx;
        const cell = this.cells[c] as Cell;
        const n = cell.fx.length / 2;
        if (cell.fxPick.length < n) cell.fxPick = new Uint8Array(n * 2);
        cell.fxPick.fill(0, 0, n);
        if (n === 0 || !had || !this.wasIn(v, cx, cy) || !this.reaches(p, c)) continue;
        for (let k = 0; k < n; k++) {
          const owner = cell.fxMeta[k * 5] as number;
          const id = cell.fxMeta[k * 5 + 3] as number;
          if (cell.fxMeta[k * 5 + 4] === 1) {
            if (v.sentFx[id]) cell.fxPick[k] = 1;
          } else if (owner === p.index) {
            cell.fxPick[k] = 1;
          } else {
            const dx = (cell.fxMeta[k * 5 + 1] as number) - p.x;
            const dy = (cell.fxMeta[k * 5 + 2] as number) - p.y;
            cands.push(dx * dx + dy * dy, c, k);
          }
        }
      }
    }
    const count = cands.length / 3;
    if (count === 0) return;
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < count; i++) order.push(i);
    order.sort((a, b) => (cands[a * 3] as number) - (cands[b * 3] as number));
    let used = 0;
    for (const i of order) {
      const cell = this.cells[cands[i * 3 + 1] as number] as Cell;
      const k = cands[i * 3 + 2] as number;
      const size = (cell.fx[k * 2 + 1] as number) - (cell.fx[k * 2] as number);
      if (used + size > OTHERS_FX_BYTES) continue;
      used += size;
      cell.fxPick[k] = 1;
    }
  }

  private add(v: NetViewer, part: number, bytes: number): void {
    this.sent[part] = (this.sent[part] as number) + bytes;
    v.parts[part] = (v.parts[part] as number) + bytes;
  }

  /** Whether a cell lies within reach of the player's screen. */
  private reaches(p: Player, c: number): boolean {
    const cx = c % this.cols;
    const cy = (c - cx) / this.cols;
    const x0 = cx * CELL_PX;
    const y0 = cy * CELL_PX;
    return (
      p.x + SCREEN_HALF_W > x0 &&
      p.x - SCREEN_HALF_W < x0 + CELL_PX &&
      p.y + SCREEN_HALF_H > y0 &&
      p.y - SCREEN_HALF_H < y0 + CELL_PX
    );
  }

  /** Every own pickup still lying, for a viewer that just came back. */
  resendDrops(v: NetViewer): void {
    const p = v.player;
    if (!p) return;
    for (const k of this.w.pickups) {
      if (!k.alive || k.owner !== p.index || !k.drop) continue;
      this.dropRecord(v, k.id, k.drop.kind, k.x, k.y, k.x, k.y);
    }
  }
}

export { HitFlag };
