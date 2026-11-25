/**
 * Development only, never in a production build: `?fight=<map id>` signs this browser in as a
 * test character and lets the real game seat it on that map (the server must run with
 * ALLOW_MAP_OPTION=1), with what recordings and measurements need around it.
 *
 * URL: `fight` map id, `cls` math|physics|chemistry|biology|earth (each class plays its own
 * account), `as` stage|pre|evo (a fresh student, one a step from evolving, one wearing evolved
 * books), `mode` 0 to 3, `tier` low|medium|high, `bots` fighting bots the dev server starts
 * around the student. V evolves the first worn book that can, through the real operation.
 */
import type { ArtMetadata } from "@guago/art";
import { audio } from "@guago/audio";
import { BOOKS } from "@guago/content";
import { API, lookOptions, MAJORS } from "@guago/shared";
import * as Phaser from "phaser";
import { setQualityTier, TIERS, type Tier } from "../render/index.ts";
import type { FightView } from "./fight-view.ts";

const params = new URLSearchParams(location.search);

const NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  stage: {
    math: "무대수학",
    physics: "무대물리",
    chemistry: "무대화학",
    biology: "무대생명",
    earth: "무대지구",
  },
  pre: {
    math: "승급수학",
    physics: "승급물리",
    chemistry: "승급화학",
    biology: "승급생명",
    earth: "승급지구",
  },
  evo: {
    math: "진화수학",
    physics: "진화물리",
    chemistry: "진화화학",
    biology: "진화생명",
    earth: "진화지구",
  },
};

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

function who(): { cls: string; as: string; name: string } {
  const cls = params.get("cls") ?? "math";
  const as = params.get("as") ?? "stage";
  return { cls, as, name: NAMES[as]?.[cls] ?? "무대" };
}

/**
 * Signs in the test character the URL names, making the account and character on first use,
 * and starts the bots it asks for. The boot scene then finds the session and enters the world.
 */
export async function seatTestCharacter(meta: ArtMetadata): Promise<void> {
  const { cls, as, name } = who();
  const loginId = as === "stage" ? `stage_${cls}` : `${as}_${cls}`;
  const password = `stage-${cls}-fights-well`;
  let me = await call("GET", API.me);
  const mine = me.status === 200 && (me.body.account as { loginId?: string })?.loginId === loginId;
  if (!mine) {
    me = await call("POST", API.login, { loginId, password });
    if (me.status !== 200)
      me = await call("POST", API.signup, { loginId, password, ageConfirmed: true });
    if (me.status !== 200) throw new Error(`test sign-in: ${JSON.stringify(me.body)}`);
    me = await call("GET", API.me);
  }
  if (!me.body.character) {
    const o = lookOptions(meta as unknown as Parameters<typeof lookOptions>[0]);
    const i = MAJORS.indexOf(cls as (typeof MAJORS)[number]);
    const pick = (xs: readonly string[], k: number) => xs[(i * 3 + k) % xs.length] as string;
    const made = await call("POST", API.character, {
      name,
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
    if (made.status !== 200) throw new Error(`test character: ${JSON.stringify(made.body)}`);
  }
  const bots = Number(params.get("bots") ?? 0);
  const map = params.get("fight") ?? "";
  await fetch(
    `/__fight/bots?n=${bots}&follow=${encodeURIComponent(name)}&map=${encodeURIComponent(map)}`,
  ).catch(() => undefined);
  const t = params.get("tier") as Tier | null;
  if (t && TIERS.includes(t)) setQualityTier(t, false);
}

/** What the world scene hands the development hooks. */
export interface DevWorld {
  readonly scene: Phaser.Scene;
  current(): { fight: FightView; room: { send(type: string, m: unknown): void } } | undefined;
}

interface Sample {
  readonly interval: number;
  readonly work: number;
  readonly draws: number;
}

/**
 * Hooks for recordings and measurements, on `window.fightDev`: frame time and draw calls over a
 * stretch, the fight's numbers, the server's dev commands, the mixer for the recording's sound.
 */
export function installFightDev(world: DevWorld): void {
  const { scene } = world;
  const game = scene.game;
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const gl = renderer.gl as WebGLRenderingContext & Record<string, unknown>;
  let draws = 0;
  let lastDraws = 0;
  let stepAt = 0;
  let work = 0;
  let recording: Sample[] | null = null;
  let heap: number[] = [];
  for (const name of ["drawElements", "drawArrays"] as const) {
    const original = (gl[name] as (...a: unknown[]) => void).bind(gl);
    (gl as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
      draws++;
      original(...args);
    };
  }
  game.events.on(Phaser.Core.Events.PRE_STEP, () => {
    stepAt = performance.now();
    draws = 0;
  });
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    lastDraws = draws;
    work = performance.now() - stepAt;
    if (!recording) return;
    recording.push({ interval: game.loop.delta, work, draws });
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (mem) heap.push(mem.usedJSHeapSize);
  });

  const measure = (seconds: number) =>
    new Promise((resolve) => {
      recording = [];
      heap = [];
      setTimeout(() => {
        const rec = recording ?? [];
        recording = null;
        const q = (xs: number[], p: number) => {
          const s = [...xs].sort((a, b) => a - b);
          return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
        };
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
        const iv = rec.map((r) => r.interval);
        const wk = rec.map((r) => r.work);
        const dc = rec.map((r) => r.draws);
        let grown = 0;
        for (let i = 1; i < heap.length; i++) {
          const d = (heap[i] as number) - (heap[i - 1] as number);
          if (d > 0) grown += d;
        }
        resolve({
          frames: rec.length,
          fps: rec.length / seconds,
          interval: { mean: mean(iv), p95: q(iv, 0.95), p99: q(iv, 0.99), max: Math.max(0, ...iv) },
          work: { mean: mean(wk), p95: q(wk, 0.95), p99: q(wk, 0.99), max: Math.max(0, ...wk) },
          draws: { mean: mean(dc), p95: q(dc, 0.95), max: Math.max(0, ...dc) },
          allocMBps: grown / 1024 / 1024 / seconds,
          fight: world.current()?.fight.stats(),
        });
      }, seconds * 1000);
    });

  const evolveOne = async () => {
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
        world.current()?.fight.evolve(book.def);
        return;
      }
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === "KeyV" && !e.repeat) void evolveOne();
  };
  window.addEventListener("keydown", onKey);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
    window.removeEventListener("keydown", onKey),
  );

  // The mode the URL asks for, once the first fight is up.
  const mode = params.get("mode");
  if (mode !== null) {
    const set = () => {
      const f = world.current()?.fight;
      if (f?.state.ready) f.actions.setMode(Number(mode));
      else setTimeout(set, 200);
    };
    set();
  }

  (window as unknown as { fightDev: unknown }).fightDev = {
    scene,
    get fight() {
      return world.current()?.fight;
    },
    stats: () => ({
      ...world.current()?.fight.stats(),
      draws: lastDraws,
      work,
      fps: game.loop.actualFps,
    }),
    measure,
    dev: (cmd: string, a?: unknown, b?: unknown) => world.current()?.room.send("dev", [cmd, a, b]),
    audio,
  };
}
