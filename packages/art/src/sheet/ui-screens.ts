/**
 * Three composed 480×270 screens built from the UI kit and the bitmap fonts, laid over the real
 * scenes by name: the HUD over the fight at the 아고라 rift, 엔트로피's first line on campus at
 * night, and the 가방 with a book's 필기 card. Damage numbers and nameplates are placed on the
 * scene's own monsters and students, so the screens follow the scenes when they change. Values
 * follow the PLAN's formulas (§8, §9) for a level 87 수학 student. Browser-safe.
 */
import type { Actor, Doll, SceneDef } from "../scene.ts";
import { SCENES } from "../scenes/index.ts";
import { measure } from "./bmfont.ts";
import type { Kit, Op, Screen } from "./ui-ops.ts";

export const SCREEN_W = 480;
export const SCREEN_H = 270;

/** Rows from the top of a line to the top of a Hangul syllable, per font. */
const INK_TOP: Readonly<Record<string, number>> = {
  galmuri11: 3,
  "galmuri11-bold": 3,
  galmuri9: 2,
};

/** Shown in a portrait slot when the build has it: `portrait-<speaker>`, first frame. */
export const portraitSprite = (speaker: string) => `portrait-${speaker}`;

class Draw {
  readonly ops: Op[] = [];
  readonly kit: Kit;
  constructor(kit: Kit) {
    this.kit = kit;
  }

  fill(color: string, x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: "fill", color, x, y, w, h });
  }

  frame(sprite: string, frame: string, x: number, y: number, sweep?: number): void {
    this.ops.push(
      sweep === undefined
        ? { op: "frame", sprite, frame, x, y }
        : { op: "frame", sprite, frame, x, y, sweep },
    );
  }

  scene(name: string, shade = 0): void {
    this.ops.push({ op: "scene", name, shade });
  }

  /** A nameplate centred under a character's feet. */
  nameplate(name: string, cx: number, feet: number): void {
    const w = this.width("galmuri9", name) + 6;
    const x = cx - Math.ceil(w / 2);
    this.slice("nameplate", "idle", x, feet + 2, w, 13);
    this.text("galmuri9", name, x + 3, feet + 4, "stone.bright");
  }

  slice(sprite: string, frame: string, x: number, y: number, w: number, h: number): void {
    if (w > 0 && h > 0) this.ops.push({ op: "slice", sprite, frame, x, y, w, h });
  }

  rig(rig: string, look: string, key: string, x: number, y: number): void {
    if (this.kit.hasLook(rig, look)) this.ops.push({ op: "rig", rig, look, key, x, y });
  }

  width(font: string, text: string): number {
    const f = this.kit.fonts.get(font);
    return f ? measure(f, text) : 0;
  }

  /** Text whose Hangul ink starts at row `y`. Returns the advance. */
  text(font: string, text: string, x: number, y: number, color?: string): number {
    const top = y - (INK_TOP[font] ?? 0);
    this.ops.push(
      color ? { op: "text", font, text, x, y: top, color } : { op: "text", font, text, x, y: top },
    );
    return this.width(font, text);
  }

  /** Text on the field: a one-pixel ink shadow below and to the right. */
  lifted(font: string, text: string, x: number, y: number, color = "stone.bright"): number {
    this.text(font, text, x + 1, y + 1, "ink.deep");
    return this.text(font, text, x, y, color);
  }

  /** Damage numerals: their own colours, top at `y`. */
  numerals(font: string, text: string, x: number, y: number): void {
    this.ops.push({ op: "text", font, text, x, y });
  }
}

// HUD -----------------------------------------------------------------------------------------

/** A bar groove with its fills: `[frame, fraction]` drawn in order. */
function bar(
  d: Draw,
  groove: string,
  fill: string,
  x: number,
  y: number,
  w: number,
  h: number,
  parts: readonly (readonly [string, number])[],
): void {
  d.slice(groove, "idle", x, y, w, h);
  for (const [frame, f] of parts)
    d.slice(fill, frame, x + 1, y + 1, Math.round((w - 2) * f), h - 2);
}

function sceneDef(name: string): SceneDef | undefined {
  return SCENES.find((d) => d.name === name);
}

/** The scene's monsters and students. A student whose look is missing still stands there in
 * the default look, so every one gets a nameplate. */
function cast(def: SceneDef | undefined) {
  const objects = def?.objects ?? [];
  const monsters = objects.filter((o): o is Actor => "actor" in o);
  const students = objects.filter((o): o is Doll => "rig" in o);
  return { monsters, students };
}

/** A round book slot: the book, darkened under a running cooldown and swept back to bright. */
function bookSlot(d: Draw, book: string | null, x: number, y: number, state: string, cd?: number) {
  if (!book) {
    d.frame("book-slot", "locked", x, y);
    d.frame("lock", "idle", x + 8, y + 7);
    return;
  }
  d.frame("book-slot", state, x, y);
  if (cd === undefined) {
    d.frame("book", book, x + 4, y + 4);
    return;
  }
  d.frame("book-dim", book, x + 4, y + 4);
  d.frame("book", book, x + 4, y + 4, cd / 16);
  d.frame("cooldown", `cd${String(cd).padStart(2, "0")}`, x, y);
}

function hud(kit: Kit): Screen {
  const d = new Draw(kit);
  const def = sceneDef("agora-rift");
  d.scene("agora-rift");

  // The scene's own fight: names under the students, numbers over the 오답 being hit.
  const { monsters, students } = cast(def);
  const you = students.find((s) => s.anim === "attack") ?? students[0];
  const others = ["밤샘연구생", "새벽세시"];
  for (const s of students)
    d.nameplate(s === you ? "졸린과학도" : (others.shift() ?? ""), s.at[0], s.at[1]);
  const struck = monsters.find((m) => m.anim === "hit") ?? monsters[0];
  const top = (m: Actor) => m.at[1] - (kit.origin(m.actor)?.[1] ?? 15);
  if (struck) {
    const crit = "2,953!";
    d.numerals(
      "dmg-crit",
      crit,
      struck.at[0] - Math.floor(d.width("dmg-crit", crit) / 2),
      top(struck) - 26,
    );
  }
  // A second number on the 오답 farthest from the first, so the two never stack.
  const far = struck
    ? monsters.reduce<Actor | undefined>(
        (best, m) =>
          !best || Math.abs(m.at[0] - struck.at[0]) > Math.abs(best.at[0] - struck.at[0])
            ? m
            : best,
        undefined,
      )
    : undefined;
  if (far && far !== struck) {
    const hit = "1,181";
    d.numerals(
      "dmg-small",
      hit,
      far.at[0] - Math.floor(d.width("dmg-small", hit) / 2),
      top(far) - 12,
    );
  }

  // You: level, HP with the chunk just lost trailing, EXP.
  d.slice("hud-plate", "idle", 6, 6, 26, 19);
  const lv = "87";
  d.text(
    "galmuri11-bold",
    lv,
    19 - Math.ceil(d.width("galmuri11-bold", lv) / 2),
    10,
    "stone.bright",
  );
  bar(d, "bar", "fill", 34, 6, 98, 13, [
    ["lag", 0.67],
    ["hp", 1204 / 1927],
  ]);
  const hp = "1,204 / 1,927";
  d.lifted("galmuri9", hp, 83 - Math.floor(d.width("galmuri9", hp) / 2), 8);
  bar(d, "bar-thin", "fill-thin", 34, 20, 98, 5, [["exp", 0.614]]);

  // Control mode: tap to cycle.
  const label = "반자동";
  d.slice("mode", "semi", 6, 29, 14 + d.width("galmuri9", label) + 4, 13);
  d.frame("mode-icon", "cycle", 10, 32);
  d.text("galmuri9", label, 20, 31, "stone.bright");

  // Chat, collapsed.
  d.slice("hud-plate", "idle", 6, 46, 18, 16);
  d.frame("icon", "chat", 9, 48);

  // Era boss: the raid the whole server shares. Four 논제, the first already won.
  const bw = 200;
  const bx = 240 - bw / 2;
  d.slice("hud-plate", "idle", bx + 9, 2, bw - 9, 33);
  d.text("galmuri11-bold", "아리스토텔레스", bx + 23, 5, "stone.bright");
  const phase = "논제 2 / 4";
  d.text("galmuri9", phase, bx + bw - 6 - d.width("galmuri9", phase), 7, "gold.light");
  d.slice("boss-bar", "idle", bx, 14, bw, 19);
  const gx = bx + 19;
  const gw = bw - 19 - 2;
  const seg = Math.floor((gw - 3) / 4);
  const segs = [
    ["cleared", 1],
    ["boss", 0.63],
    ["sealed", 1],
    ["sealed", 1],
  ] as const;
  segs.forEach(([frame, f], i) => {
    const w = i === 3 ? gw - 3 * (seg + 1) : seg;
    d.slice("fill", frame, gx + i * (seg + 1), 19, Math.round(w * f), 9);
    if (i > 0) d.frame("boss-tick", "idle", gx + i * (seg + 1) - 1, 19);
  });

  // 벌점 and the 자습 pool.
  d.slice("hud-plate", "idle", 350, 6, 62, 16);
  d.frame("icon", "whistle", 353, 8);
  d.text("galmuri9", "벌점 3", 368, 9, "stone.bright");
  d.slice("hud-plate", "idle", 350, 24, 62, 16);
  d.frame("icon", "pool", 353, 26);
  bar(d, "bar-thin", "fill-thin", 368, 29, 40, 5, [["pool", 200 / 480]]);

  // Minimap of the arena, named underneath.
  d.fill("grass.dark", 420, 10, 50, 50);
  d.slice("minimap", "idle", 416, 6, 58, 58);
  d.frame("map-dot", "boss", 442, 16);
  d.frame("map-dot", "party", 433, 36);
  d.frame("map-dot", "party", 452, 40);
  d.frame("map-dot", "me", 442, 34);
  d.frame("map-dot", "portal", 424, 50);
  const map = "아고라";
  d.slice("hud-plate", "idle", 416, 63, 58, 15);
  d.text("galmuri9", map, 445 - Math.ceil(d.width("galmuri9", map) / 2), 66, "stone.bright");

  // The right thumb's cluster, a honeycomb around the dodge in the corner: the first three
  // books on the inner ring, the fourth and the two locked slots on the outer ring, and
  // interact at its lower end.
  d.frame("stick-base", "idle", 14, 210);
  d.frame("stick-knob", "idle", 34, 220);
  const cx = 440;
  const cy = 230;
  d.frame("touch-main", "idle", cx - 17, cy - 17);
  d.frame("touch-icon", "dodge", cx - 7, cy - 7);
  const at = (r: number, deg: number, half: number) =>
    [
      Math.round(cx + r * Math.cos((deg * Math.PI) / 180)) - half,
      Math.round(cy + r * Math.sin((deg * Math.PI) / 180)) - half,
    ] as const;
  const slots: readonly (readonly [string | null, number, number, string, number?])[] = [
    ["probability", 38, 180, "idle"],
    ["sequence", 38, 225, "idle", 5],
    ["graph", 38, 270, "ready"],
    ["proof", 64, 202.5, "idle", 11],
    [null, 64, 247.5, "locked"],
    [null, 64, 292.5, "locked"],
  ];
  for (const [book, r, deg, state, cd] of slots) {
    const [x, y] = at(r, deg, 12);
    bookSlot(d, book, x, y, state, cd);
  }
  const [ix, iy] = at(64, 157.5, 14);
  d.frame("touch-btn", "idle", ix, iy);
  d.frame("touch-icon", "interact", ix + 7, iy + 7);

  return { name: "hud", w: SCREEN_W, h: SCREEN_H, ops: d.ops };
}

// Dialogue ------------------------------------------------------------------------------------

function dialogue(kit: Kit): Screen {
  const d = new Draw(kit);
  d.scene("campus-night");
  // 엔트로피 sits at the student's feet, looking unimpressed, unless the scene has already put
  // the cat somewhere of its own choosing.
  const def = sceneDef("campus-night");
  const placed = [...(def?.objects ?? []), ...(def?.overhead ?? [])].some(
    (o) => ("prop" in o && o.prop === "entropy") || ("actor" in o && o.actor === "entropy"),
  );
  const { students } = cast(def);
  const near = students.find((s) => s.dir === "up") ?? students[0];
  const cat = kit.origin("entropy");
  if (!placed && near && cat)
    d.frame("entropy", "sit0", near.at[0] + 14 - cat[0], near.at[1] - cat[1]);

  // A notebook page: the portrait pasted in the margin, lines ruled for what the cat says.
  const x = 8;
  const y = 198;
  const w = 464;
  const h = 66;
  d.slice("dialog", "idle", x, y, w, h);
  const speaker = "엔트로피";
  const tw = d.width("galmuri11-bold", speaker) + 14;
  d.slice("nametab", "idle", 80, y - 16, tw, 18);
  d.text("galmuri11-bold", speaker, 87, y - 12, "stone.bright");

  d.frame("portrait-slot", "idle", x + 10, y + 7);
  const portrait = portraitSprite("entropy");
  const frames = kit.frames(portrait);
  if (frames[0]) d.frame(portrait, frames[0], x + 12, y + 9);
  d.frame("portrait-corners", "idle", x + 10, y + 7);

  const left = x + 70;
  d.slice("margin", "idle", left, y + 5, 1, h - 10);
  for (const line of [0, 1, 2]) d.slice("row", "idle", left + 1, y + 6 + line * 17, w - 70 - 6, 16);
  d.text("galmuri11", "그거, 이제 무기야.", left + 8, y + 9, "ink.dark");
  d.frame("caret", "up", x + w - 18, y + h - 16);
  return { name: "dialogue", w: SCREEN_W, h: SCREEN_H, ops: d.ops };
}

// 가방 -----------------------------------------------------------------------------------------

/**
 * The sample book: 확률과 통계, 심화서 (×2.2), +7, one failed attempt since its last success.
 * PLAN §8: going to +8 is 70% base, +10 points of pity per failure; cost at n = 7 is
 * 잉크 10 × 1.15⁷ ≈ 27 and 솔방울 100 × 1.15⁷ × 2.2 ≈ 585. The game takes these from the
 * shared formula once 필기 is built; the sheet only shows them.
 */
const PILGI = { base: 70, odds: 80, ink: 27, coins: 585 } as const;

const num = (n: number) => n.toLocaleString("en-US");

function bag(kit: Kit): Screen {
  const d = new Draw(kit);
  // The field stays in view, two palette steps down, behind the open notebook.
  d.scene("campus-night", 2);

  // The panel rises from the bottom edge; its title is on the cover's name label.
  const px = 6;
  const py = 32;
  const pw = 468;
  const ph = 234;
  d.slice("panel", "idle", px, py, pw, ph);
  const title = "가방";
  d.slice("label", "idle", px + 10, py + 2, d.width("galmuri11-bold", title) + 12, 15);
  d.text("galmuri11-bold", title, px + 16, py + 4, "ink.dark");
  d.frame("close", "idle", px + pw - 17, py + 4);

  // Purse, on the cover, where 필기 spends from.
  const coins = 12840;
  const ink = 140;
  let cx = px + pw - 26;
  const purse = (icon: string, value: string) => {
    cx -= d.width("galmuri9", value);
    d.text("galmuri9", value, cx, py + 7, "stone.bright");
    cx -= 14;
    d.frame("icon", icon, cx, py + 4);
    cx -= 10;
  };
  purse("ink", num(ink));
  purse("pinecone", num(coins));

  // Books tab open over the bag's well.
  const wx = px + 11;
  const wy = py + 36;
  const cols = 7;
  const rows = 7;
  const ww = cols * 26 + 4 + 8;
  const wh = rows * 26 + 4;
  let tx = wx + 4;
  for (const [label, open] of [
    ["책", true],
    ["도구", false],
    ["재료", false],
    ["꾸미기", false],
  ] as const) {
    const w = d.width("galmuri9", label) + 12;
    d.slice("tab", open ? "open" : "idle", tx, wy - 15, w, 17);
    tx += w + 1;
  }
  d.slice("inset", "idle", wx, wy, ww, wh);
  tx = wx + 4;
  for (const [label, open] of [
    ["책", true],
    ["도구", false],
    ["재료", false],
    ["꾸미기", false],
  ] as const) {
    const w = d.width("galmuri9", label) + 12;
    d.text("galmuri9", label, tx + 6, open ? wy - 11 : wy - 10, open ? "ink.dark" : "stone.dark");
    tx += w + 1;
  }

  const owned: readonly (readonly [string, string])[] = [
    ["probability", "advanced"],
    ["proof", "original"],
    ["sequence", "major"],
    ["graph", "reference"],
    ["coordinate", "reference"],
    ["wangdo", "advanced"],
    ["wangdo", "textbook"],
    ["sequence", "textbook"],
    ["graph", "textbook"],
    ["coordinate", "textbook"],
    ["probability", "textbook"],
  ];
  for (let i = 0; i < cols * rows; i++) {
    const sx = wx + 4 + (i % cols) * 26;
    const sy = wy + 3 + Math.floor(i / cols) * 26;
    const item = owned[i];
    if (item) {
      d.frame("item", item[1], sx, sy);
      d.frame("book", item[0], sx + 4, sy + 4);
    } else d.frame("item-empty", "idle", sx, sy);
  }
  d.frame("item-select", "idle", wx, wy - 1);
  d.slice("scroll-track", "idle", wx + ww - 7, wy + 3, 5, wh - 6);
  d.slice("scroll-thumb", "idle", wx + ww - 7, wy + 3, 5, 54);

  // The detail card of the selected book.
  const dx = wx + ww + 8;
  const dy = py + 23;
  const dw = px + pw - 12 - dx;
  const dh = wy + wh - dy;
  d.slice("inset", "idle", dx, dy, dw, dh);
  d.frame("item", "advanced", dx + 8, dy + 8);
  d.frame("book", "probability", dx + 12, dy + 12);
  d.text("galmuri11-bold", "확률과 통계", dx + 40, dy + 9, "ink.dark");
  let lx = dx + 40;
  lx += d.text("galmuri9", "심화서", lx, dy + 24, "navy.mid") + 6;
  lx += d.text("galmuri9", "Lv.42", lx, dy + 24, "stone.dark") + 6;
  d.text("galmuri9", "필기 +7", lx, dy + 24, "stone.dark");

  d.text("galmuri9", "맞힐 때마다 주사위를 굴린다. ×1부터 ×6까지.", dx + 8, dy + 42, "ink.dark");
  const row = (label: string, value: string, y: number) => {
    d.text("galmuri9", label, dx + 8, y, "stone.dark");
    d.text("galmuri9", value, dx + dw - 8 - d.width("galmuri9", value), y, "ink.dark");
    d.slice("row", "idle", dx + 6, y - 4, dw - 12, 16);
  };
  row("등급 배율", "×2.2", dy + 60);
  row("필기", "+28%", dy + 76);

  // 필기: +7 → +8, one failure banked.
  const p = PILGI;
  const fy = dy + 100;
  d.text("galmuri11-bold", "필기 +7 → +8", dx + 8, fy, "ink.dark");
  const odds = `${p.odds}%`;
  d.text("galmuri11-bold", odds, dx + dw - 8 - d.width("galmuri11-bold", odds), fy, "red.mid");
  const why = `기본 ${p.base}% · 실패 보정 +${p.odds - p.base}%`;
  d.text("galmuri9", why, dx + dw - 8 - d.width("galmuri9", why), fy + 16, "stone.dark");

  const cost = (icon: string, need: number, have: number, y: number) => {
    d.frame("icon", icon, dx + 8, y - 2);
    const t = `${num(need)} / ${num(have)}`;
    d.text("galmuri9", t, dx + 24, y, "ink.dark");
  };
  cost("ink", p.ink, ink, fy + 34);
  cost("pinecone", p.coins, coins, fy + 50);

  const bw = 64;
  const by = dy + dh - 8 - 19;
  d.slice("btn-ink", "idle", dx + dw - 8 - bw, by, bw, 19);
  const go = "필기";
  d.text(
    "galmuri11-bold",
    go,
    dx + dw - 8 - bw + Math.floor((bw - d.width("galmuri11-bold", go)) / 2),
    by + 4,
    "stone.bright",
  );

  return { name: "bag", w: SCREEN_W, h: SCREEN_H, ops: d.ops };
}

export function screens(kit: Kit): Screen[] {
  return [hud(kit), dialogue(kit), bag(kit)];
}
