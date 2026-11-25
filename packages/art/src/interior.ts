/**
 * Authoring kit for the school's interiors: one legend for every room, and helpers that draw
 * furniture the way the rest of the game is drawn. Top-down three-quarter view: a top face seen
 * from above, a front face below it, light from the top left, coloured outlines in the darkest
 * step of each material's ramp.
 *
 * Wall-mounted things (windows, boards, clocks, doors) anchor on the floor line of the wall they
 * hang on, one pixel in front of it, so they always sort after the wall and before anything
 * standing in the room. See `mounted`.
 */
import { type Legend, type SpriteDef, sprite, type Vec } from "./format.ts";
import { lobes, Pic } from "./paint.ts";
import { colorIndex, RAMP_LIST } from "./palette.ts";

/** One character per palette colour, shared by every interior source. */
export const IL: Legend = {
  ".": null,
  // ink
  J: "ink.deep",
  j: "ink.dark",
  I: "ink.mid",
  i: "ink.light",
  // stone: plaster, steel, porcelain, paper
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  L: "stone.lamp",
  V: "stone.vein",
  // red
  Q: "red.deep",
  q: "red.dark",
  R: "red.mid",
  r: "red.light",
  "!": "red.pale",
  // clay
  C: "clay.dark",
  T: "clay.mid",
  t: "clay.light",
  P: "clay.pale",
  p: "clay.dust",
  // gold: light and pale stay lit at night, so they are for lamps, screens and glow only
  O: "gold.dark",
  o: "gold.mid",
  y: "gold.light",
  Y: "gold.pale",
  // wood
  B: "wood.deep",
  b: "wood.dark",
  U: "wood.mid",
  u: "wood.light",
  W: "wood.pale",
  // flesh
  F: "flesh.mid",
  f: "flesh.light",
  e: "flesh.pale",
  E: "flesh.bright",
  // grass and board
  Z: "grass.deep",
  D: "grass.dark",
  G: "grass.mid",
  g: "grass.light",
  h: "grass.pale",
  H: "grass.bright",
  s: "grass.soft",
  "5": "board.dark",
  "6": "board.light",
  // olive
  "1": "olive.deep",
  "2": "olive.dark",
  "3": "olive.mid",
  "4": "olive.light",
  // navy
  v: "navy.dark",
  N: "navy.mid",
  n: "navy.light",
  m: "navy.pale",
  // sea
  "7": "sea.deep",
  "8": "sea.dark",
  "9": "sea.mid",
  c: "sea.light",
  "~": "sea.pale",
  // plum and rose
  A: "plum.deep",
  a: "plum.dark",
  X: "plum.mid",
  x: "plum.light",
  "%": "plum.pale",
  "&": "rose.dark",
  "@": "rose.mid",
  "+": "rose.light",
  "=": "rose.pale",
};

/** Legend character of every ramp's darkest step, per character. */
const DEEP: ReadonlyMap<string, string> = (() => {
  const byIndex = new Map<number, string>();
  for (const [ch, name] of Object.entries(IL)) {
    if (name && !byIndex.has(colorIndex(name))) byIndex.set(colorIndex(name), ch);
  }
  const out = new Map<string, string>();
  for (const [ch, name] of Object.entries(IL)) {
    if (!name) continue;
    const ramp = RAMP_LIST.find((r) => r.name === name.split(".")[0]);
    const deep = ramp?.indices[0];
    const deepCh = deep === undefined ? undefined : byIndex.get(deep);
    if (deepCh) out.set(ch, deepCh);
  }
  return out;
})();

/** The outline character for a fill character: its ramp's darkest step. */
export function deepOf(ch: string): string {
  return DEEP.get(ch) ?? ch;
}

const DEEP_CHARS = new Set(DEEP.values());

// Drawing ---------------------------------------------------------------------------------------

export function rect(p: Pic, x: number, y: number, w: number, h: number, ch: string): Pic {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) p.set(xx, yy, ch);
  return p;
}

export function hline(p: Pic, x: number, y: number, w: number, ch: string): Pic {
  return rect(p, x, y, w, 1, ch);
}

export function vline(p: Pic, x: number, y: number, h: number, ch: string): Pic {
  return rect(p, x, y, 1, h, ch);
}

/**
 * Outlines a picture: every opaque pixel touching clear on a side (or the picture edge) becomes
 * the darkest step of its own ramp, unless it already is one or is listed in `keep`. With `to`,
 * every outline pixel takes that character instead.
 */
export function rim(p: Pic, opt: { keep?: string; to?: string } = {}): Pic {
  const out = p.clone();
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const ch = p.at(x, y) as string;
      if (ch === "." || opt.keep?.includes(ch)) continue;
      const open = [p.at(x - 1, y), p.at(x + 1, y), p.at(x, y - 1), p.at(x, y + 1)].some(
        (n) => n === undefined || n === ".",
      );
      if (!open) continue;
      if (opt.to) out.set(x, y, opt.to);
      else if (!DEEP_CHARS.has(ch)) out.set(x, y, deepOf(ch));
    }
  }
  return out;
}

const COLOR_OF: ReadonlyMap<string, number> = new Map(
  Object.entries(IL).flatMap(([ch, name]) => (name ? [[ch, colorIndex(name)] as const] : [])),
);

/**
 * Folds stray single pixels (no neighbour of the same colour in eight directions) into the
 * colour most of their neighbours share, like the build's orphan check sees them. Characters in
 * `keep` stay. Clear pixels are left alone and never spread.
 */
export function clean(p: Pic, keep = ""): Pic {
  const color = (ch: string | undefined) => (ch === undefined ? -1 : (COLOR_OF.get(ch) ?? -2));
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const ch = p.at(x, y) as string;
        if (ch === "." || keep.includes(ch)) continue;
        const c = color(ch);
        const around = new Map<string, number>();
        let paired = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const n = p.at(x + dx, y + dy);
            if (n === undefined || n === ".") continue;
            if (color(n) === c) paired = true;
            around.set(n, (around.get(n) ?? 0) + 1);
          }
        }
        if (paired) continue;
        const best = [...around].sort((a, b) => b[1] - a[1])[0];
        if (best) p.set(x, y, best[0]);
      }
    }
  }
  return p;
}

/**
 * Cleans, outlines, then cleans again inside the outline: the usual last step for a piece of
 * furniture. `keep` lists characters that may stand alone (and stay out of the outline).
 */
export function finish(p: Pic, keep = ""): Pic {
  const out = rim(clean(p, keep), { keep });
  // Where two materials meet on the outline, a lone pixel of one ramp's deep takes its
  // neighbours' deep instead.
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const ch = out.at(x, y) as string;
      if (!DEEP_CHARS.has(ch)) continue;
      const c = COLOR_OF.get(ch);
      const deeps = new Map<string, number>();
      let paired = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const n = out.at(x + dx, y + dy);
          if ((!dx && !dy) || n === undefined || !DEEP_CHARS.has(n)) continue;
          if (COLOR_OF.get(n) === c) paired = true;
          deeps.set(n, (deeps.get(n) ?? 0) + 1);
        }
      const best = [...deeps].sort((a, b) => b[1] - a[1])[0];
      if (!paired && best) out.set(x, y, best[0]);
    }
  }
  return clean(out, keep + [...DEEP_CHARS].join(""));
}

/** A material as four characters, dark to light, plus an optional glint. */
export interface Mat {
  readonly dark: string;
  readonly mid: string;
  readonly light: string;
  readonly hi: string;
}

export const WOOD: Mat = { dark: "b", mid: "U", light: "u", hi: "W" };
export const PALEWOOD: Mat = { dark: "U", mid: "u", light: "W", hi: "P" };
export const STEEL: Mat = { dark: "S", mid: "M", light: "K", hi: "k" };
export const WHITE: Mat = { dark: "M", mid: "K", light: "k", hi: "w" };
export const DARKSTEEL: Mat = { dark: "I", mid: "i", light: "M", hi: "K" };
export const GREEN: Mat = { dark: "5", mid: "D", light: "6", hi: "s" };
export const NAVY: Mat = { dark: "v", mid: "N", light: "n", hi: "m" };

/**
 * A block seen in three-quarter view: a top face `top` rows deep, then a front face `front` rows
 * tall, `w` wide, at (x, y). The top is lit with a bright back edge and left edge; the front is
 * one step darker, shaded on its right and along its foot. No outline: call `rim` when done.
 */
export function block(
  p: Pic,
  x: number,
  y: number,
  w: number,
  top: number,
  front: number,
  t: Mat,
  f: Mat = t,
): Pic {
  rect(p, x, y, w, top, t.light);
  if (top > 2) {
    hline(p, x, y, w, t.hi);
    vline(p, x, y, top, t.hi);
    vline(p, x + w - 1, y + 1, top - 1, t.mid);
  }
  if (front > 0) {
    rect(p, x, y + top, w, front, f.mid);
    hline(p, x, y + top, w, f.light);
    vline(p, x + w - 1, y + top, front, f.dark);
    if (front > 2) hline(p, x, y + top + front - 1, w, f.dark);
  }
  return p;
}

// Shadows ---------------------------------------------------------------------------------------

/** A shadow grid: an oval, as on the outdoor props. */
export function ovalShadow(
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "J");
  return pic.toString();
}

/**
 * A shadow grid for furniture standing on the floor: its footprint (`x0..x1`, `y0..y1`, inclusive)
 * pushed `dx` right and `dy` down, away from the light, with the far corners cut.
 */
export function boxShadow(
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dx = 2,
  dy = 1,
): string {
  const pic = Pic.blank(w, h);
  const ax = x0 + dx;
  const bx = Math.min(w - 1, x1 + dx);
  const ay = y0 + dy;
  const by = Math.min(h - 1, y1 + dy);
  for (let y = ay; y <= by; y++) {
    for (let x = ax; x <= bx; x++) {
      const corner = (x === ax || x === bx) && (y === ay || y === by);
      if (!corner) pic.set(x, y, "J");
    }
  }
  // Under the object itself, so nothing shows between its legs.
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pic.set(x, y, "J");
  return pic.toString();
}

/** Merges shadow grids of one size. */
export function shadows(...grids: string[]): string {
  const pics = grids.map((g) => Pic.of(g));
  const out = (pics[0] as Pic).clone();
  for (const p of pics.slice(1)) out.put(p, 0, 0);
  return out.toString();
}

// Sprites ---------------------------------------------------------------------------------------

type Extra = Partial<Omit<SpriteDef, "kind" | "name" | "size" | "frames" | "anim" | "palette">>;

/** An interior sprite with one still frame. */
export function still(name: string, grid: string | Pic, extra: Extra = {}): SpriteDef {
  const pic = typeof grid === "string" ? Pic.of(grid) : grid;
  return sprite({
    name,
    group: "interior",
    size: [pic.w, pic.h],
    palette: IL,
    frames: { still: pic.toString() },
    anim: { idle: { frames: ["still"], fps: 1 } },
    ...extra,
  });
}

/** An interior sprite with named frames; the first frame is the idle. */
export function frames(
  name: string,
  list: Readonly<Record<string, string | Pic>>,
  extra: Extra & { anim?: SpriteDef["anim"] } = {},
): SpriteDef {
  const entries = Object.entries(list).map(([k, v]) => [k, v.toString()] as const);
  const first = Pic.of(entries[0]?.[1] ?? "");
  return sprite({
    name,
    group: "interior",
    size: [first.w, first.h],
    palette: IL,
    frames: Object.fromEntries(entries),
    anim: extra.anim ?? { idle: { frames: [entries[0]?.[0] ?? ""], fps: 1 } },
    ...extra,
  });
}

/**
 * Origin for something hung on a back wall: `size` is the sprite, `lift` how many pixels its
 * bottom edge sits above the floor line. Placed at the wall's floor line plus one, it sorts after
 * the wall and before anything in the room.
 */
export function mounted([w, h]: Vec, lift: number): Vec {
  return [Math.floor(w / 2), h + lift];
}

/** Height of every back wall face, floor line to ceiling, in pixels: three tiles. */
export const WALL_H = 48;
