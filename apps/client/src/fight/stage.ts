/**
 * The fight stage: a development scene that plays a real fight against a local game server,
 * without the rest of the game around it. Never part of a production build (main.ts loads it
 * only under Vite's dev server, from `?fight=<map id>`).
 *
 * URL: `fight` map id (the server must run it: GUAGO_MAP), `cls` math|physics|chemistry|biology|
 * earth (each class plays its own account), `mode` 0 to 3, `tier` low|medium|high, `bots` a
 * number of fighting bots the dev server starts, `music` 0 to mute the band, `readout` 1 for the
 * development numbers (never in a recording).
 */
import { Client, type Room } from "@colyseus/sdk";
import { audio } from "@guago/audio";
import { BOOKS, mapById } from "@guago/content";
import {
  API,
  encodeInput,
  type Facing,
  INPUT_MESSAGE,
  lookOptions,
  MAJORS,
  MAP_ROOM,
  MapState,
  MODE_MESSAGE,
  ROOMS_PATH,
} from "@guago/shared";
import * as Phaser from "phaser";
import { CameraRig } from "../camera.ts";
import { UI_SCENE, type WorldEntry } from "../entry.ts";
import { bindFight } from "../hud/fight.ts";
import { KeyboardMove } from "../input.ts";
import { artMetadata } from "../render/assets.ts";
import { loadMap, MapView, setQualityTier, TIERS, type Tier } from "../render/index.ts";
import { SelfMover } from "../self.ts";
import { setUiArt } from "../ui/theme.ts";
import { session } from "../world/session.ts";
import { FightView } from "./fight-view.ts";

const NAMES: Readonly<Record<string, string>> = {
  math: "무대수학",
  physics: "무대물리",
  chemistry: "무대화학",
  biology: "무대생명",
  earth: "무대지구",
};
/** The stage's students one step from evolving (`moment=1`): V sends the `evolve` operation. */
const MOMENT_NAMES: Readonly<Record<string, string>> = {
  math: "승급수학",
  physics: "승급물리",
  chemistry: "승급화학",
  biology: "승급생명",
  earth: "승급지구",
};
/** The stage's students whose books are worn evolved (`evolved=1`). */
const EVOLVED_NAMES: Readonly<Record<string, string>> = {
  math: "진화수학",
  physics: "진화물리",
  chemistry: "진화화학",
  biology: "진화생명",
  earth: "진화지구",
};
/** The camera frames the body, not the feet. */
const CHEST_PX = 10;

/** Binds the HUD to the fight the way the game will: the session starts, the UI scene draws. */
function bindHud(scene: Phaser.Scene, fight: FightView, entry: WorldEntry): void {
  setUiArt(artMetadata(scene));
  scene.scene.launch(UI_SCENE);
  session.start(entry);
  const unbind = bindFight(fight.hud);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unbind();
    session.stop();
  });
}

async function call(method: "GET" | "POST", route: string, body?: unknown) {
  const res = await fetch(route, {
    method,
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // Empty answers carry nothing.
  }
  return { status: res.status, body: json };
}

/**
 * Signs this browser in as the stage's player of class `cls`, making the account on first use.
 * Returns who is playing, as the front end hands it to the world.
 */
async function signIn(
  cls: string,
  meta: ReturnType<typeof artMetadata>,
  evolved: boolean,
  moment: boolean,
): Promise<WorldEntry> {
  const loginId = moment ? `pre_${cls}` : evolved ? `evo_${cls}` : `stage_${cls}`;
  const password = `stage-${cls}-fights-well`;
  let me = await call("GET", API.me);
  const mine = me.status === 200 && (me.body.account as { loginId?: string })?.loginId === loginId;
  if (!mine) {
    me = await call("POST", API.login, { loginId, password });
    if (me.status !== 200)
      me = await call("POST", API.signup, { loginId, password, ageConfirmed: true });
    if (me.status !== 200) throw new Error(`stage sign-in: ${JSON.stringify(me.body)}`);
    me = await call("GET", API.me);
  }
  if (!me.body.character) {
    const o = lookOptions(meta as unknown as Parameters<typeof lookOptions>[0]);
    const i = MAJORS.indexOf(cls as (typeof MAJORS)[number]);
    const pick = (xs: readonly string[], k: number) => xs[(i * 3 + k) % xs.length] as string;
    const made = await call("POST", API.character, {
      name: (moment ? MOMENT_NAMES[cls] : evolved ? EVOLVED_NAMES[cls] : NAMES[cls]) ?? "무대",
      major: cls,
      look: {
        body: pick(o.body, 0),
        hair: pick(o.hair, 1),
        hairColor: pick(o.hairColor, 2),
        face: pick(o.face, 0),
        uniform: pick(o.uniform, 1),
        accessories: [],
      },
    });
    if (made.status !== 200) throw new Error(`stage character: ${JSON.stringify(made.body)}`);
  }
  me = await call("GET", API.me);
  return { account: me.body.account, character: me.body.character } as unknown as WorldEntry;
}

interface Sample {
  readonly interval: number;
  readonly work: number;
  readonly draws: number;
}

export class FightStage extends Phaser.Scene {
  private readonly params = new URLSearchParams(location.search);
  private id = "";
  private view!: MapView;
  private fight: FightView | null = null;
  private room: Room<unknown, MapState> | null = null;
  private self: SelfMover | null = null;
  private keys!: KeyboardMove;
  private camera!: CameraRig;
  private drawn: { x: number; y: number; facing: Facing } | undefined;
  private live = false;
  private last = 0;
  private draws = 0;
  private lastDraws = 0;
  private stepAt = 0;
  private workMs = 0;
  private recording: Sample[] | null = null;
  private heap: number[] = [];
  private readout: HTMLDivElement | null = null;

  constructor() {
    super("fight-stage");
  }

  preload(): void {
    this.id = this.params.get("fight") || "p1-colonnade";
    loadMap(this, this.id);
    FightView.preload(this);
  }

  create(): void {
    const t = this.params.get("tier") as Tier | null;
    const tier = t && TIERS.includes(t) ? t : "high";
    setQualityTier(tier, false);
    this.view = MapView.create(this, this.id, { tier });
    const cam = this.cameras.main;
    this.camera = new CameraRig(cam, this.view.width, this.view.height);
    const spawn = this.view.map.spawns.main ?? { x: this.view.width / 2, y: this.view.height / 2 };
    this.camera.jumpTo(spawn.x, spawn.y - CHEST_PX);
    this.keys = new KeyboardMove();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.keys.dispose());
    this.countFrames();
    void this.start(tier);
  }

  private async start(tier: Tier): Promise<void> {
    const cls = this.params.get("cls") ?? "math";
    const evolved = this.params.get("evolved") === "1";
    const moment = this.params.get("moment") === "1";
    const entry = await signIn(cls, artMetadata(this), evolved, moment);
    const bots = Number(this.params.get("bots") ?? 0);
    const name = moment ? MOMENT_NAMES[cls] : evolved ? EVOLVED_NAMES[cls] : NAMES[cls];
    const follow = encodeURIComponent(name ?? "");
    await fetch(`/__fight/bots?n=${bots}&follow=${follow}`).catch(() => undefined);
    const client = new Client(ROOMS_PATH);
    const room = await client.joinOrCreate(MAP_ROOM, {}, MapState);
    this.room = room;
    const map = mapById(this.id);
    if (!map) throw new Error(`no map ${this.id}`);
    const self = new SelfMover(map, (input) => room.send(INPUT_MESSAGE, encodeInput(input)));
    this.self = self;
    this.live = true;
    room.onStateChange((state) => {
      for (const p of state.players.values()) {
        // In 완전 자동 and 스킬 수동 the server walks the body; knocked out, nothing moves it.
        if (p.sid === room.sessionId)
          self.serverDriven = p.mode === 0 || p.mode === 2 || p.down > 0;
      }
    });
    room.onDrop(() => {
      this.live = false;
    });
    room.onReconnect(() => {
      this.live = true;
      self.resync();
    });
    this.fight = FightView.attach(this, this.view, room, {
      self: () => this.drawn,
      mover: self,
      onSelf: (me) =>
        self.onServer({ x: me.x, y: me.y, facing: me.facing, seq: me.seq, roll: me.roll }),
      tier,
      music: this.params.get("music") !== "0",
    });
    const mode = this.params.get("mode");
    if (mode !== null) room.send(MODE_MESSAGE, [Number(mode)]);
    // The books worn evolved, from the inventory, so the player's own casts take their form.
    const inv = await call("GET", API.inventory);
    const items = (inv.body.items ?? []) as {
      kind: string;
      def: string;
      slot: number | null;
      evolved: boolean;
    }[];
    this.fight.setEvolved(
      items.filter((i) => i.kind === "book" && i.slot !== null && i.evolved).map((i) => i.def),
    );
    if (this.params.get("hud") !== "0") bindHud(this, this.fight, entry);
    // Development only: V evolves the first worn book that can, through the real operation.
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyV" && !e.repeat) void this.evolveOne();
    };
    window.addEventListener("keydown", onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      window.removeEventListener("keydown", onKey),
    );
    if (this.params.get("readout") === "1") this.makeReadout();
    this.expose();
  }

  /** Sends `evolve` for the first worn book whose linked tool is in the bag; the fight marks it. */
  private async evolveOne(): Promise<void> {
    const inv = await call("GET", API.inventory);
    const items = (inv.body.items ?? []) as {
      id: string;
      kind: string;
      def: string;
      slot: number | null;
      evolved: boolean;
    }[];
    for (const book of items) {
      if (book.kind !== "book" || book.slot === null || book.evolved) continue;
      const linked = BOOKS.find((b) => b.id === book.def)?.tool;
      const tool = items.find((i) => i.kind === "tool" && i.def === linked);
      if (!tool) continue;
      const res = await call("POST", API.op, {
        id: crypto.randomUUID(),
        op: "evolve",
        req: { item: book.id, tool: tool.id },
      });
      if (res.status === 200 && (res.body as { ok?: boolean }).ok !== false) {
        this.fight?.evolve(book.def);
        return;
      }
    }
  }

  override update(time: number, delta: number): void {
    const dt = this.last === 0 ? 0 : Math.min(250, time - this.last);
    this.last = time;
    if (this.self && this.fight) {
      const d = this.self.frame(dt, () => this.keys.sample(), this.live);
      if (d) {
        if (!this.drawn) this.camera.jumpTo(d.x, d.y - CHEST_PX);
        this.drawn = { x: d.x, y: d.y, facing: d.facing };
        this.camera.follow(d.x, d.y - CHEST_PX, d.facing, dt);
      }
      this.fight.update(time, delta);
    }
    this.updateReadout();
  }

  // Measuring ----------------------------------------------------------------------------------

  /** Counts draw calls and the work each frame takes, step through render. */
  private countFrames(): void {
    const renderer = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const gl = renderer.gl as WebGLRenderingContext & Record<string, unknown>;
    for (const name of ["drawElements", "drawArrays"] as const) {
      const original = (gl[name] as (...a: unknown[]) => void).bind(gl);
      (gl as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        this.draws++;
        original(...args);
      };
    }
    this.game.events.on(Phaser.Core.Events.PRE_STEP, () => {
      this.stepAt = performance.now();
      this.draws = 0;
    });
    this.game.events.on(Phaser.Core.Events.POST_RENDER, () => {
      this.lastDraws = this.draws;
      this.workMs = performance.now() - this.stepAt;
      if (this.recording) {
        this.recording.push({
          interval: this.game.loop.delta,
          work: this.workMs,
          draws: this.draws,
        });
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        if (mem) this.heap.push(mem.usedJSHeapSize);
      }
    });
  }

  private measure(seconds: number): Promise<unknown> {
    this.recording = [];
    this.heap = [];
    return new Promise((resolve) => {
      this.time.delayedCall(seconds * 1000, () => {
        const rec = this.recording ?? [];
        this.recording = null;
        const q = (xs: number[], p: number) => {
          const s = [...xs].sort((a, b) => a - b);
          return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
        };
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
        const iv = rec.map((r) => r.interval);
        const wk = rec.map((r) => r.work);
        const dc = rec.map((r) => r.draws);
        let grown = 0;
        for (let i = 1; i < this.heap.length; i++) {
          const d = (this.heap[i] as number) - (this.heap[i - 1] as number);
          if (d > 0) grown += d;
        }
        resolve({
          frames: rec.length,
          fps: rec.length / seconds,
          interval: { mean: mean(iv), p95: q(iv, 0.95), p99: q(iv, 0.99), max: Math.max(0, ...iv) },
          work: { mean: mean(wk), p95: q(wk, 0.95), p99: q(wk, 0.99), max: Math.max(0, ...wk) },
          draws: { mean: mean(dc), p95: q(dc, 0.95), max: Math.max(0, ...dc) },
          allocMBps: grown / 1024 / 1024 / seconds,
          heapSamples: this.heap.length,
          fight: this.fight?.stats(),
          view: this.view.stats(),
        });
      });
    });
  }

  private expose(): void {
    (window as unknown as { fightStage: unknown }).fightStage = {
      scene: this,
      fight: this.fight,
      view: this.view,
      room: this.room,
      stats: () => ({
        ...this.fight?.stats(),
        draws: this.lastDraws,
        work: this.workMs,
        fps: this.game.loop.actualFps,
        tier: this.view.qualityTier,
        self: this.drawn,
      }),
      setTier: (t: Tier) => {
        this.view.setTier(t);
        this.fight?.setTier(t);
      },
      measure: (s: number) => this.measure(s),
      dev: (cmd: string, a?: unknown, b?: unknown) => this.room?.send("dev", [cmd, a, b]),
      state: () => this.fight?.state,
      audio,
    };
  }

  private makeReadout(): void {
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;left:6px;top:6px;z-index:10;font:11px/1.35 ui-monospace,monospace;color:#e0d5c2;background:#1a1427cc;padding:4px 6px;white-space:pre;pointer-events:none";
    document.body.appendChild(el);
    this.readout = el;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => el.remove());
  }

  private updateReadout(): void {
    if (!this.readout || this.game.loop.frame % 10 !== 0 || !this.fight) return;
    const s = this.fight.stats();
    this.readout.textContent = [
      `${this.game.loop.actualFps.toFixed(0)} fps  work ${this.workMs.toFixed(1)} ms  ${this.lastDraws} draws  ${this.view.qualityTier}`,
      `monsters ${s.monsters}  players ${s.players}  effects ${s.effects}  pieces ${s.pieces}  particles ${s.particles}  numbers ${s.numbers}`,
      `tick ${s.tick}  delay ${s.delay.toFixed(2)}  hits ${s.hits}  kills ${s.kills}`,
    ].join("\n");
  }
}
