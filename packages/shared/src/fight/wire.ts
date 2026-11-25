/**
 * The fight on the wire (PLAN §19 "Fallback", §21). Monsters, other players, minions, effects
 * and public events travel in one binary message per client per tick, built from per-interest-
 * cell blocks that every viewer of a cell shares; players' identity and the owner's own body stay
 * in schema state. Positions are quarter pixels and dead-reckoned: a member that keeps its
 * velocity costs two bits a tick. Everything is little-endian.
 *
 * Message: u8 flags · u16 tick · the window (u8 x0, y0, width, height, in 8×8-tile cells) · a
 * status nibble per cell (quiet, delta or keyframe; players' effects follow) · cell blocks in
 * window order · private records.
 *
 * Delta block: removals (varint count, each varint of old index × 4 + reason) · the codes of
 * the members that stayed, dense (two bits each) or sparse (gap and code per changed member,
 * flagged in the cell's status) · their payloads in order · arrivals (varint count, a bit each
 * for "walked in from a cell you hold", then an id or a full record each) · monsters' tells
 * and public bursts (varint count, records) · then, when its bit is set, players' effects. A
 * keyframe block is a member count, full records, then every effect worth seeing.
 */

/** Snapshot interest cells: 8×8 tiles. A client's window is the cells around its screen. */
export const SNAP_CELL_TILES = 8;

/** Byte message type on the room (numeric, so the frame header stays two bytes). */
export const SNAPSHOT_MESSAGE = 1;

/** Quarter pixels. */
export const Q = 4;
/** Dead reckoning: a member is corrected only when its guessed position is off by more than
 * this, in Q units (one pixel: drawn at whole pixels, the error never shows as more than one). */
export const DR_EPS = 4;
/** Monsters may be off by a pixel and a half: they are drawn in crowds, and hits use the truth. */
export const DR_EPS_MONSTER = 6;

/** Wire kinds besides monster kind indices. */
export const WirePlayer = 250;
export const WireMinion = 251;

/** Why a member left a cell. */
export const Leave = { Died: 0, Gone: 1, Moved: 2 } as const;

/**
 * 2-bit member codes. A move is the step from the last position, two bytes, which the client
 * keeps taking every tick until told otherwise; an extra (code 2, any other) is a mask byte and
 * the fields it names.
 */
const CODE_SAME = 0;
const CODE_MOVE = 1;
const CODE_FLASH = 3;

/** Bits of an extra update. */
export const Extra = {
  State: 1,
  Hp: 2,
  Status: 4,
  Flash: 8,
  Move: 16,
  Abs: 32,
} as const;

/** Record types in a cell's effect list. */
export const FxRec = { Spawn: 1, End: 2 } as const;

/** Private record types. */
export const Priv = {
  Hit: 1,
  Hurt: 2,
  Drop: 3,
  Collect: 4,
  LevelUp: 5,
  Phase: 6,
  Merit: 7,
  Roll: 8,
  Down: 9,
  Revive: 10,
  Wake: 11,
  /** u16 fx · u16 cast: which of the owner's casts an effect belongs to. */
  Cast: 12,
  /** The client's own body when it changed: u8 mask, then the fields it names (`SelfField`). */
  Self: 13,
  /** A boss fight cue (note: a `BOSS_CUES` index, b the player's body slot or -1). */
  Cue: 14,
  /** The client completed an objective (note: a `ObjectiveKind`). */
  Objective: 15,
  /**
   * The boss's bar as this client sees it, when it changed (HP at most 5 times a second):
   * u16 entity · u8 boss · u8 phase · u8 flags (`BossFlag`) · u8 mode · f32 hp · f32 max ·
   * u8 shield (0–255).
   */
  Boss: 16,
} as const;

/** A boss record as read (`Priv.Boss`). */
export interface WireBoss {
  entity: number;
  boss: number;
  phase: number;
  flags: number;
  mode: number;
  hp: number;
  max: number;
  /** 0 to 1. */
  shield: number;
}

/**
 * Fields of a Self record: the body absolutely (u16 x, u16 y in 1/POS_SCALE px, u8 facing, u32
 * seq, u8 roll inputs left) or as a step from the last one (i8 dx, i8 dy in 1/POS_SCALE px, u8
 * facing, u8 inputs applied since, u8 roll inputs left), health as f32, shield as f32.
 */
export const SelfField = { Body: 1, Hp: 2, Shield: 4, Step: 8 } as const;

/** The client's own body as the server last left it: what its prediction reconciles against. */
export interface WireSelf {
  /** In 1/POS_SCALE px, as `PlayerState` carried it. */
  x: number;
  y: number;
  facing: number;
  /** Last input applied. */
  seq: number;
  /** Inputs left in a dodge roll it asked for, for replaying the rest of it. */
  roll: number;
  hp: number;
  shield: number;
}

/** Burst kinds (a reaction's index is below 16). */
export const BurstKind = { Qed: 16, Heal: 17, LevelUp: 18, Elite: 19, Revive: 20 } as const;

// ── Bytes ───────────────────────────────────────────────────────────────────

export class ByteWriter {
  buf: Uint8Array;
  view: DataView;
  n = 0;

  constructor(size = 4096) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
  }

  reset(): void {
    this.n = 0;
  }

  private room(k: number): void {
    if (this.n + k <= this.buf.length) return;
    const grown = new Uint8Array(Math.max(this.buf.length * 2, this.n + k));
    grown.set(this.buf.subarray(0, this.n));
    this.buf = grown;
    this.view = new DataView(grown.buffer);
  }

  u8(v: number): void {
    this.room(1);
    this.buf[this.n++] = v & 0xff;
  }

  i8(v: number): void {
    this.u8(v < 0 ? v + 256 : v);
  }

  u16(v: number): void {
    this.room(2);
    this.view.setUint16(this.n, v & 0xffff, true);
    this.n += 2;
  }

  i16(v: number): void {
    this.room(2);
    this.view.setInt16(this.n, v, true);
    this.n += 2;
  }

  u32(v: number): void {
    this.room(4);
    this.view.setUint32(this.n, v >>> 0, true);
    this.n += 4;
  }

  f32(v: number): void {
    this.room(4);
    this.view.setFloat32(this.n, v, true);
    this.n += 4;
  }

  varint(v: number): void {
    let x = v >>> 0;
    while (x >= 0x80) {
      this.u8((x & 0x7f) | 0x80);
      x >>>= 7;
    }
    this.u8(x);
  }

  bytes(b: Uint8Array): void {
    this.room(b.length);
    this.buf.set(b, this.n);
    this.n += b.length;
  }

  /** A position for a later `u8`/`u16` written in place. */
  mark(): number {
    return this.n;
  }

  setU8(at: number, v: number): void {
    this.buf[at] = v & 0xff;
  }

  setU32(at: number, v: number): void {
    this.view.setUint32(at, v >>> 0, true);
  }

  copy(): Uint8Array {
    return this.buf.slice(0, this.n);
  }
}

export class ByteReader {
  buf: Uint8Array;
  view: DataView;
  n = 0;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get left(): number {
    return this.buf.length - this.n;
  }

  u8(): number {
    return this.buf[this.n++] as number;
  }

  i8(): number {
    const v = this.u8();
    return v > 127 ? v - 256 : v;
  }

  u16(): number {
    const v = this.view.getUint16(this.n, true);
    this.n += 2;
    return v;
  }

  i16(): number {
    const v = this.view.getInt16(this.n, true);
    this.n += 2;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.n, true);
    this.n += 4;
    return v;
  }

  f32(): number {
    const v = this.view.getFloat32(this.n, true);
    this.n += 4;
    return v;
  }

  varint(): number {
    let v = 0;
    let shift = 0;
    for (;;) {
      const b = this.u8();
      v |= (b & 0x7f) << shift;
      if (b < 0x80) return v >>> 0;
      shift += 7;
    }
  }
}

/** An angle as u16. */
export function angle16(a: number): number {
  let t = a / (Math.PI * 2);
  t -= Math.floor(t);
  return Math.round(t * 65536) & 0xffff;
}

export function fromAngle16(v: number): number {
  return (v / 65536) * Math.PI * 2;
}

// ── Members ─────────────────────────────────────────────────────────────────

/** What a client knows about one entity: its perceived (dead-reckoned) state. */
export interface WireMember {
  id: number;
  kind: number;
  /** Player body slot, or a minion's owner slot. */
  slot: number;
  /** Position and per-tick velocity in Q units. */
  qx: number;
  qy: number;
  qvx: number;
  qvy: number;
  state: number;
  hp: number;
  status: number;
  /** Hit this tick. */
  flash: boolean;
  /** The cell whose list holds it on the client. */
  cell: number;
}

/**
 * Full record: u16 id · u8 kind · u8 present (1 velocity, 2 hp, 4 status) · [u8 slot] · u16 x ·
 * u16 y · u8 state · [i8 vx, i8 vy] · [u8 hp, else full] · [u16 status, else none].
 */
export function readFull(r: ByteReader, into: WireMember): WireMember {
  into.id = r.u16();
  into.kind = r.u8();
  const has = r.u8();
  into.slot = into.kind >= WirePlayer ? r.u8() : 0;
  into.qx = r.u16();
  into.qy = r.u16();
  into.state = r.u8();
  if (has & 1) {
    into.qvx = r.i8();
    into.qvy = r.i8();
  } else {
    into.qvx = 0;
    into.qvy = 0;
  }
  into.hp = has & 2 ? r.u8() : 255;
  into.status = has & 4 ? r.u16() : 0;
  into.flash = false;
  return into;
}

// ── Effects ─────────────────────────────────────────────────────────────────

/**
 * One effect as the client draws it. Which fields mean what depends on `kind` (FxKind); unused
 * fields are zero. Geometry is in whole pixels and radians; times in ticks.
 */
export interface WireFx {
  fx: number;
  kind: number;
  /** Entity id of the player or monster it belongs to; 0 for none. */
  owner: number;
  /** Book index for a player's effect, behaviour for a monster's tell, burst kind for a burst. */
  def: number;
  /** A player's effect from the book's evolved form (draw `evo-<evolution id>`). */
  evolved: boolean;
  cast: number;
  /** Ticks after the message's tick that it starts (a delayed follow-up, the next wave); negative
   * for one already running when the client came to see it. */
  start: number;
  x: number;
  y: number;
  angle: number;
  radius: number;
  length: number;
  width: number;
  /** Count of bodies, beams' harmonic, cone pulses. */
  count: number;
  duration: number;
  /** px per tick. */
  speed: number;
  tx: number;
  ty: number;
  /** Entity it rides on (orbit, following zone), 0 for none. */
  anchor: number;
  /** Orbit: ticks per revolution or swing; swing arc; precession, radians per tick. */
  period: number;
  sweep: number;
  spin: number;
  /** Beam: sine amplitude, wavelength, reflections. Lob: peak height. Danger: delay. */
  a: number;
  b: number;
  c: number;
  flags: number;
  /** Chain: struck entity ids and the index of each one's parent (-1 for the first). */
  chain: number[];
  parents: number[];
}

export function emptyFx(): WireFx {
  return {
    fx: 0,
    kind: 0,
    owner: 0,
    def: 0,
    evolved: false,
    cast: 0,
    start: 0,
    x: 0,
    y: 0,
    angle: 0,
    radius: 0,
    length: 0,
    width: 0,
    count: 0,
    duration: 0,
    speed: 0,
    tx: 0,
    ty: 0,
    anchor: 0,
    period: 0,
    sweep: 0,
    spin: 0,
    a: 0,
    b: 0,
    c: 0,
    flags: 0,
    chain: [],
    parents: [],
  };
}

/** FxKind values, repeated here so the wire does not depend on the world module. */
const K = {
  Shot: 0,
  Lob: 1,
  EnemyShot: 2,
  Orbit: 3,
  Beam: 4,
  Chain: 5,
  Cone: 6,
  Mark: 7,
  Wave: 8,
  Zone: 9,
  Pool: 10,
  Trail: 11,
  Dash: 12,
  Danger: 13,
  Burst: 14,
} as const;

const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const clamp16 = (v: number) => Math.max(0, Math.min(65535, Math.round(v)));
const clampI8 = (v: number) => Math.max(-128, Math.min(127, Math.round(v)));

/** Set on the kind byte when a start offset follows. */
const HAS_START = 0x40;
/** Kind byte flag: the effect comes from an evolved book. */
const EVOLVED = 0x80;

/**
 * An effect's spawn: u8 type · u16 fx · u8 kind (+ start flag) · u16 owner · u8 def ·
 * [i16 start] · u16 x · u16 y · the kind's own fields. Cast ids go to their owner privately.
 */
export function writeFx(w: ByteWriter, f: WireFx): void {
  const start = Math.max(-32768, Math.min(32767, Math.round(f.start)));
  w.u8(FxRec.Spawn);
  w.u16(f.fx);
  w.u8(f.kind | (start !== 0 ? HAS_START : 0) | (f.evolved ? EVOLVED : 0));
  w.u16(f.owner);
  w.u8(f.def);
  if (start !== 0) w.i16(start);
  w.u16(clamp16(f.x));
  w.u16(clamp16(f.y));
  switch (f.kind) {
    case K.Shot:
    case K.EnemyShot:
      w.u16(angle16(f.angle));
      w.u8(clamp8(f.speed * Q));
      w.u8(clamp8(f.radius));
      w.u16(clamp16(f.length));
      w.u8(clamp8(f.count));
      break;
    case K.Lob:
      w.u16(clamp16(f.tx));
      w.u16(clamp16(f.ty));
      w.u8(clamp8(f.duration));
      w.u8(clamp8(f.a));
      w.u8(clamp8(f.radius));
      break;
    case K.Orbit:
      w.u16(f.anchor);
      w.u8(clamp8(f.count));
      w.u8(clamp8(f.radius));
      w.u8(clamp8(f.width));
      w.u16(clamp16(f.period * 8));
      w.u16(angle16(f.angle));
      w.u8(clamp8((f.sweep * 180) / Math.PI / 2));
      w.i8(clampI8(f.spin * 1000));
      w.u16(clamp16(f.duration));
      break;
    case K.Beam:
      w.u16(angle16(f.angle));
      w.u16(clamp16(f.length));
      w.u8(clamp8(f.width));
      w.u8(clamp8(f.a));
      w.u8(clamp8(f.b));
      w.u8(clamp8(f.c));
      w.u8(clamp8(f.count));
      w.u8(clamp8(f.duration));
      break;
    case K.Chain:
      w.u8(f.chain.length);
      for (let i = 0; i < f.chain.length; i++) {
        w.u16(f.chain[i] as number);
        w.u8((f.parents[i] as number) & 0xff);
      }
      break;
    case K.Cone:
      w.u16(angle16(f.angle));
      w.u8(clamp8((f.width * 180) / Math.PI));
      w.u8(clamp8(f.length));
      w.u8(clamp8(f.count));
      w.u8(clamp8(f.duration));
      w.u8(clamp8(f.a));
      w.u16(f.anchor);
      break;
    case K.Mark:
    case K.Danger:
      w.u16(angle16(f.angle));
      w.u8(clamp8(f.radius));
      w.u16(clamp16(f.length));
      w.u8(clamp8(f.width));
      w.u8(clamp8(f.a));
      w.u8(clamp8(f.count));
      w.u8(clamp8(f.period));
      w.u8(f.flags & 0xff);
      break;
    case K.Wave:
      w.u8(clamp8(f.radius));
      w.u8(clamp8(f.speed * Q));
      w.u8(clamp8(f.width));
      w.u8(clamp8(f.duration));
      w.u8(clamp8(f.a));
      w.u8(f.flags & 0xff);
      break;
    case K.Zone:
    case K.Pool:
    case K.Trail:
      w.u8(clamp8(f.radius));
      w.u16(clamp16(f.duration));
      w.u16(f.anchor);
      w.u8(clamp8(f.speed * 16));
      w.i8(clampI8(f.spin * 1000));
      w.u8(f.flags & 0xff);
      break;
    case K.Dash:
      w.u16(clamp16(f.tx));
      w.u16(clamp16(f.ty));
      w.u8(clamp8(f.duration));
      break;
    case K.Burst:
      w.u8(clamp8(f.radius));
      break;
  }
}

export function readFx(r: ByteReader, f: WireFx): WireFx {
  f.fx = r.u16();
  const kind = r.u8();
  f.kind = kind & 0x3f;
  f.evolved = (kind & EVOLVED) !== 0;
  f.owner = r.u16();
  f.def = r.u8();
  f.cast = 0;
  f.start = kind & HAS_START ? r.i16() : 0;
  f.x = r.u16();
  f.y = r.u16();
  f.chain = [];
  f.parents = [];
  switch (f.kind) {
    case K.Shot:
    case K.EnemyShot:
      f.angle = fromAngle16(r.u16());
      f.speed = r.u8() / Q;
      f.radius = r.u8();
      f.length = r.u16();
      f.count = r.u8();
      break;
    case K.Lob:
      f.tx = r.u16();
      f.ty = r.u16();
      f.duration = r.u8();
      f.a = r.u8();
      f.radius = r.u8();
      break;
    case K.Orbit:
      f.anchor = r.u16();
      f.count = r.u8();
      f.radius = r.u8();
      f.width = r.u8();
      f.period = r.u16() / 8;
      f.angle = fromAngle16(r.u16());
      f.sweep = ((r.u8() * 2) / 180) * Math.PI;
      f.spin = r.i8() / 1000;
      f.duration = r.u16();
      break;
    case K.Beam:
      f.angle = fromAngle16(r.u16());
      f.length = r.u16();
      f.width = r.u8();
      f.a = r.u8();
      f.b = r.u8();
      f.c = r.u8();
      f.count = r.u8();
      f.duration = r.u8();
      break;
    case K.Chain: {
      const n = r.u8();
      for (let i = 0; i < n; i++) {
        f.chain.push(r.u16());
        const p = r.u8();
        f.parents.push(p === 255 ? -1 : p);
      }
      break;
    }
    case K.Cone:
      f.angle = fromAngle16(r.u16());
      f.width = (r.u8() * Math.PI) / 180;
      f.length = r.u8();
      f.count = r.u8();
      f.duration = r.u8();
      f.a = r.u8();
      f.anchor = r.u16();
      break;
    case K.Mark:
    case K.Danger:
      f.angle = fromAngle16(r.u16());
      f.radius = r.u8();
      f.length = r.u16();
      f.width = r.u8();
      f.a = r.u8();
      f.count = r.u8();
      f.period = r.u8();
      f.flags = r.u8();
      break;
    case K.Wave:
      f.radius = r.u8();
      f.speed = r.u8() / Q;
      f.width = r.u8();
      f.duration = r.u8();
      f.a = r.u8();
      f.flags = r.u8();
      break;
    case K.Zone:
    case K.Pool:
    case K.Trail:
      f.radius = r.u8();
      f.duration = r.u16();
      f.anchor = r.u16();
      f.speed = r.u8() / 16;
      f.spin = r.i8() / 1000;
      f.flags = r.u8();
      break;
    case K.Dash:
      f.tx = r.u16();
      f.ty = r.u16();
      f.duration = r.u8();
      break;
    case K.Burst:
      f.radius = r.u8();
      break;
  }
  return f;
}

// ── Private records ─────────────────────────────────────────────────────────

/** A merged hit the client's own player landed this tick. */
export interface WireHit {
  target: number;
  amount: number;
  /** HitFlag bits. */
  flags: number;
  slot: number;
  /** 증명 stacks on the target after the hit (수학). */
  proof: number;
  cast: number;
  /** Knockback velocity it left, px per tick. */
  kx: number;
  ky: number;
  /** Hits merged into this record. */
  count: number;
  /** The target's health after the tick's hits, a 0–255 share of its max (0 dead). */
  hp: number;
}

export interface WireHurt {
  source: number;
  amount: number;
  flags: number;
}

export interface WireDrop {
  id: number;
  kind: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
}

// ── Decoding ────────────────────────────────────────────────────────────────

/** What the client does with a decoded message. */
export interface SnapshotSink {
  /** A member came into view (or moved into another cell in view). */
  enter(m: WireMember): void;
  /** A member left view: died, despawned, or walked out of the window. */
  leave(m: WireMember, reason: number): void;
  fx(f: WireFx): void;
  fxEnd(fx: number, x: number, y: number): void;
  hit(h: WireHit): void;
  hurt(h: WireHurt): void;
  drop(d: WireDrop): void;
  collect(id: number): void;
  /** One of the client's own effects and the cast it came from. */
  cast(fx: number, cast: number): void;
  /** The client's own body changed; fields not in the record keep their last value. */
  self(s: WireSelf): void;
  /** Level ups, phases, merits, rolls, knock-outs, boss cues, objectives: `type` is a `Priv`. */
  note(type: number, a: number, b: number, c: number): void;
  /** The boss's bar, phase, shield and gimmick state changed. */
  boss(b: WireBoss): void;
}

/**
 * The client's copy of what it sees: members by id and the order of each cell's members, kept
 * in step with the server's blocks. Every message advances every member one tick of dead
 * reckoning, so `members` always holds this tick's perceived positions.
 */
export class SnapshotReader {
  readonly members = new Map<number, WireMember>();
  private readonly cells = new Map<number, WireMember[]>();
  private readonly limbo = new Map<number, WireMember>();
  private codes = new Uint8Array(256);
  private readonly scratchFx = emptyFx();
  private readonly scratchHit: WireHit = {
    target: 0,
    amount: 0,
    flags: 0,
    slot: 0,
    proof: 0,
    cast: 0,
    kx: 0,
    ky: 0,
    count: 1,
    hp: 255,
  };
  private readonly scratchHurt: WireHurt = { source: 0, amount: 0, flags: 0 };
  private readonly scratchDrop: WireDrop = { id: 0, kind: 0, x: 0, y: 0, fromX: 0, fromY: 0 };
  tick = 0;
  private lowTick = -1;
  /** Map size in snapshot cells (`SNAP_CELL_TILES`), needed to place the window. */
  cols = 1;
  rows = 1;

  /** Forgets everything, as after a reconnect: the next message brings keyframes. */
  reset(): void {
    this.members.clear();
    this.cells.clear();
    this.limbo.clear();
    this.lowTick = -1;
  }

  read(bytes: Uint8Array, sink: SnapshotSink): void {
    const r = new ByteReader(bytes);
    const flags = r.u8();
    const low = r.u16();
    // The tick goes out as its low 16 bits; unwrap against the last one seen.
    if (this.lowTick < 0) this.tick = low;
    else {
      let d = low - this.lowTick;
      if (d < -32768) d += 65536;
      else if (d > 32768) d -= 65536;
      this.tick += d;
    }
    this.lowTick = low;
    const x0 = r.u8();
    const y0 = r.u8();
    const ww = r.u8();
    const hh = r.u8();
    const n = ww * hh;
    const statusAt = r.n;
    r.n += (n + 1) >> 1;
    // Cells no longer in the window drop their members from view.
    for (const [cell, list] of this.cells) {
      const cx = cell % this.cols;
      const cy = (cell - cx) / this.cols;
      if (cx >= x0 && cx < x0 + ww && cy >= y0 && cy < y0 + hh) continue;
      for (const m of list) if (m.cell === cell) this.limbo.set(m.id, m);
      this.cells.delete(cell);
    }
    let i = 0;
    for (let cy = y0; cy < y0 + hh; cy++) {
      for (let cx = x0; cx < x0 + ww; cx++, i++) {
        const cell = cy * this.cols + cx;
        const status = ((r.buf[statusAt + (i >> 1)] as number) >> ((i & 1) * 4)) & 15;
        const kind = status & 3;
        if (kind === 2) {
          const old = this.cells.get(cell);
          if (old) for (const m of old) if (m.cell === cell) this.limbo.set(m.id, m);
          this.readKey(r, cell, sink);
          continue;
        }
        if (kind === 0) {
          for (const m of this.cells.get(cell) ?? []) {
            m.qx += m.qvx;
            m.qy += m.qvy;
            m.flash = false;
          }
        } else {
          this.readDelta(r, cell, (status & 8) !== 0, sink);
        }
        if (status & 4) this.readFxList(r, sink);
      }
    }
    for (const [id, m] of this.limbo) {
      if (this.cells.get(m.cell)?.includes(m)) continue;
      this.members.delete(id);
      sink.leave(m, Leave.Moved);
    }
    this.limbo.clear();
    if (flags & 1) this.readPrivate(r, sink);
  }

  private take(id: number): WireMember | undefined {
    const m = this.limbo.get(id);
    if (m) this.limbo.delete(id);
    return m;
  }

  private add(r: ByteReader, list: WireMember[], cell: number, sink: SnapshotSink): void {
    const fresh: WireMember = {
      id: 0,
      kind: 0,
      slot: 0,
      qx: 0,
      qy: 0,
      qvx: 0,
      qvy: 0,
      state: 0,
      hp: 0,
      status: 0,
      flash: false,
      cell,
    };
    readFull(r, fresh);
    const known = this.take(fresh.id) ?? this.members.get(fresh.id);
    const m = known ?? fresh;
    if (known) Object.assign(known, fresh);
    m.cell = cell;
    list.push(m);
    this.members.set(m.id, m);
    if (!known) sink.enter(m);
  }

  /** An entity that walked in from a cell this client holds: it keeps its state. */
  private transfer(id: number, list: WireMember[], cell: number): void {
    let m = this.take(id) ?? this.members.get(id);
    if (!m) {
      // Never expected; keep the list aligned with the server's.
      this.broken++;
      m = {
        id,
        kind: 255,
        slot: 0,
        qx: 0,
        qy: 0,
        qvx: 0,
        qvy: 0,
        state: 0,
        hp: 0,
        status: 0,
        flash: false,
        cell,
      };
    }
    m.qx += m.qvx;
    m.qy += m.qvy;
    m.flash = false;
    m.cell = cell;
    list.push(m);
    this.members.set(id, m);
  }

  /** The client's own body, accumulated over Self records. */
  readonly me: WireSelf = { x: 0, y: 0, facing: 0, seq: 0, roll: 0, hp: 0, shield: 0 };
  /** The last boss record. */
  readonly boss: WireBoss = {
    entity: 0,
    boss: 0,
    phase: 0,
    flags: 0,
    mode: 0,
    hp: 0,
    max: 0,
    shield: 0,
  };
  hasSelf = false;

  /** Transfers that found nothing to transfer: zero unless the two sides disagree. */
  broken = 0;

  private readKey(r: ByteReader, cell: number, sink: SnapshotSink): void {
    const n = r.varint();
    const list: WireMember[] = [];
    for (let i = 0; i < n; i++) this.add(r, list, cell, sink);
    this.cells.set(cell, list);
    this.readFxList(r, sink);
  }

  private readDelta(r: ByteReader, cell: number, sparse: boolean, sink: SnapshotSink): void {
    let list = this.cells.get(cell);
    if (!list) {
      list = [];
      this.cells.set(cell, list);
    }
    const removed = r.varint();
    for (let i = 0; i < removed; i++) {
      const packed = r.varint();
      const at = packed >>> 2;
      const reason = packed & 3;
      const m = list[at];
      if (!m) continue;
      list[at] = undefined as unknown as WireMember;
      if (reason === Leave.Moved) {
        // Already placed in another cell earlier in this message: nothing to keep.
        if (m.cell === cell) this.limbo.set(m.id, m);
      } else {
        this.members.delete(m.id);
        sink.leave(m, reason);
      }
    }
    if (removed > 0) {
      let k = 0;
      for (const m of list) if (m !== undefined) list[k++] = m;
      list.length = k;
    }
    const n = list.length;
    const codes = this.codes;
    if (codes.length < n) this.codes = new Uint8Array(Math.max(n, codes.length * 2));
    const c = this.codes;
    c.fill(0, 0, n);
    if (sparse) {
      const changed = r.varint();
      let at = -1;
      for (let k = 0; k < changed; k++) {
        at += r.varint() + 1;
        c[at] = r.u8();
      }
    } else {
      const bytes = (n + 3) >> 2;
      for (let k = 0; k < bytes; k++) {
        const b = r.u8();
        for (let j = 0; j < 4 && k * 4 + j < n; j++) c[k * 4 + j] = (b >> (j * 2)) & 3;
      }
    }
    for (let i = 0; i < n; i++) {
      const code = c[i] as number;
      const m = list[i] as WireMember;
      m.flash = false;
      if (code === CODE_SAME) {
        m.qx += m.qvx;
        m.qy += m.qvy;
      } else if (code === CODE_MOVE) {
        m.qvx = r.i8();
        m.qvy = r.i8();
        m.qx += m.qvx;
        m.qy += m.qvy;
      } else if (code === CODE_FLASH) {
        m.flash = true;
        m.qx += m.qvx;
        m.qy += m.qvy;
      } else {
        const mask = r.u8();
        if (mask & Extra.State) m.state = r.u8();
        if (mask & Extra.Hp) m.hp = r.u8();
        if (mask & Extra.Status) m.status = r.u16();
        if (mask & Extra.Flash) m.flash = true;
        if (mask & Extra.Abs) {
          m.qx = r.u16();
          m.qy = r.u16();
          m.qvx = 0;
          m.qvy = 0;
        } else if (mask & Extra.Move) {
          m.qvx = r.i8();
          m.qvy = r.i8();
          m.qx += m.qvx;
          m.qy += m.qvy;
        } else {
          m.qx += m.qvx;
          m.qy += m.qvy;
        }
      }
    }
    const added = r.varint();
    const bits = r.n;
    r.n += (added + 7) >> 3;
    for (let i = 0; i < added; i++) {
      if (((r.buf[bits + (i >> 3)] as number) >> (i & 7)) & 1) this.transfer(r.u16(), list, cell);
      else this.add(r, list, cell, sink);
    }
    this.readFxList(r, sink);
  }

  private readFxList(r: ByteReader, sink: SnapshotSink): void {
    const n = r.varint();
    for (let i = 0; i < n; i++) {
      const type = r.u8();
      if (type === FxRec.Spawn) sink.fx(readFx(r, this.scratchFx));
      else sink.fxEnd(r.u16(), r.u16(), r.u16());
    }
  }

  private readPrivate(r: ByteReader, sink: SnapshotSink): void {
    const n = r.varint();
    for (let i = 0; i < n; i++) {
      const type = r.u8();
      switch (type) {
        case Priv.Hit: {
          const h = this.scratchHit;
          h.target = r.u16();
          h.amount = r.f32();
          h.flags = r.u8();
          const sp = r.u8();
          h.slot = sp & 15;
          h.proof = sp >> 4;
          h.cast = r.u16();
          h.kx = r.i8() / Q;
          h.ky = r.i8() / Q;
          h.count = r.u8();
          h.hp = r.u8();
          sink.hit(h);
          break;
        }
        case Priv.Hurt: {
          const h = this.scratchHurt;
          h.source = r.u16();
          h.amount = r.f32();
          h.flags = r.u8();
          sink.hurt(h);
          break;
        }
        case Priv.Drop: {
          const d = this.scratchDrop;
          d.id = r.u16();
          d.kind = r.u8();
          d.x = r.u16();
          d.y = r.u16();
          d.fromX = r.u16();
          d.fromY = r.u16();
          sink.drop(d);
          break;
        }
        case Priv.Collect:
          sink.collect(r.u16());
          break;
        case Priv.Cast:
          sink.cast(r.u16(), r.u16());
          break;
        case Priv.Self: {
          const me = this.me;
          const mask = r.u8();
          if (mask & SelfField.Body) {
            me.x = r.u16();
            me.y = r.u16();
            me.facing = r.u8();
            me.seq = r.u32();
            me.roll = r.u8();
          } else if (mask & SelfField.Step) {
            me.x += r.i8();
            me.y += r.i8();
            me.facing = r.u8();
            me.seq += r.u8();
            me.roll = r.u8();
          }
          if (mask & SelfField.Hp) me.hp = r.f32();
          if (mask & SelfField.Shield) me.shield = r.f32();
          this.hasSelf = true;
          sink.self(me);
          break;
        }
        case Priv.Boss: {
          const b = this.boss;
          b.entity = r.u16();
          b.boss = r.u8();
          b.phase = r.u8();
          b.flags = r.u8();
          b.mode = r.u8();
          b.hp = r.f32();
          b.max = r.f32();
          b.shield = r.u8() / 255;
          sink.boss(b);
          break;
        }
        default:
          sink.note(type, r.i16(), r.i16(), r.i16());
      }
    }
  }
}

/** A sink that ignores everything, for tools that only count bytes. */
export const NULL_SINK: SnapshotSink = {
  enter() {},
  leave() {},
  fx() {},
  fxEnd() {},
  hit() {},
  hurt() {},
  drop() {},
  collect() {},
  cast() {},
  self() {},
  note() {},
  boss() {},
};
