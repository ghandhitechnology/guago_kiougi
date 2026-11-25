/**
 * Authoring helpers for 48×48 dialogue portraits, so the whole cast reads as one hand: one head
 * construction, one set of eyes, brows and mouths, one way of lighting skin. A portrait file
 * draws only what makes its person: hair, clothes, the one item they carry, and which eyes and
 * mouth each expression uses.
 *
 * Every helper returns a `Pic` in the shared letters of `FACE`; a portrait adds its own letters
 * for hair (`X x h H Y`, dark to light), clothes and items, and lists its iris colour.
 */

import { type Lobe, lobes, Pic, shade, tidy } from "./paint.ts";
import type { ColorName, SlotColorName } from "./palette.ts";

export const PORTRAIT = 48;

type Name = ColorName | SlotColorName;

/** Skin ramps by tone: outline, line, deep shade, shade, base, and the lit cheek. */
const TONES = {
  fair: ["flesh.deep", "flesh.dark", "flesh.light", "flesh.pale", "flesh.bright"],
  warm: ["flesh.deep", "flesh.dark", "flesh.mid", "flesh.light", "flesh.pale"],
  deep: ["flesh.deep", "flesh.dark", "flesh.dark", "flesh.mid", "flesh.light"],
} as const satisfies Record<string, readonly Name[]>;
export type Tone = keyof typeof TONES;

/**
 * The shared letters. Skin: `K` outline, `k` line, `s` deep shade, `S` shade, `f` base.
 * Eyes: `e` lash and pupil, `w` white, `i` `I` iris dark and light (each portrait names them),
 * `^` glint. Mouth: `M` inside, `t` tongue. `'` blush.
 */
export function faceLegend(tone: Tone, iris: readonly [Name, Name]): Record<string, Name | null> {
  const [K, k, s, S, f] = TONES[tone];
  return {
    ".": null,
    K,
    k,
    s,
    S,
    f,
    e: "ink.deep",
    w: "stone.bright",
    o: "stone.bright",
    "^": "stone.bright",
    n: TONES[tone][1],
    i: iris[0],
    I: iris[1],
    M: "red.dark",
    t: "rose.mid",
    "'": tone === "deep" ? "rose.mid" : "rose.light",
  };
}

/** Characters every portrait may leave standing alone: the parts of an eye, the nose, an open mouth. */
export const FACE_LONE = "^noMiI";

// Head ---------------------------------------------------------------------------------------

export interface HeadShape {
  /** Centre column, between two pixels when the width is even. */
  readonly cx: number;
  readonly top: number;
  /** Row of the widest point, the cheekbones. */
  readonly cheek: number;
  readonly chin: number;
  /** Half the width at the cheekbones. */
  readonly half: number;
  /** Half the width of the chin's flat. 0 is pointed, larger is a broad jaw. */
  readonly jaw: number;
}

/** Proportions per age: students have big round heads, adults longer faces, elders broad ones. */
export const HEADS = {
  student: { cx: 24, top: 9, cheek: 26, chin: 38, half: 14, jaw: 3 },
  adult: { cx: 24, top: 8, cheek: 25, chin: 39, half: 13.5, jaw: 4 },
  broad: { cx: 24, top: 8, cheek: 27, chin: 39, half: 15, jaw: 6 },
} as const satisfies Record<string, HeadShape>;

function halfWidth(s: HeadShape, y: number): number {
  const yc = y + 0.5;
  if (yc < s.top || yc > s.chin + 1) return -1;
  if (yc <= s.cheek) {
    const t = (s.cheek - yc) / (s.cheek - s.top);
    return s.half * Math.sqrt(Math.max(0, 1 - t * t * t));
  }
  const t = (yc - s.cheek) / (s.chin + 1 - s.cheek);
  const round = Math.sqrt(Math.max(0, 1 - t ** 4));
  return (
    s.jaw +
    (s.half - s.jaw) * (1 - t ** 1.7) * 0.75 +
    (s.half - s.jaw) * 0.25 * round -
    t ** 6 * s.jaw
  );
}

export function insideHead(s: HeadShape): (x: number, y: number) => boolean {
  return (x, y) => Math.abs(x + 0.5 - s.cx) <= halfWidth(s, y);
}

/**
 * Light from the top left on a rounded head: base, then shade along the far cheek and jaw,
 * deeper right under the jaw. The shade follows the form; it is never a vertical band.
 */
function skinTone(s: HeadShape, x: number, y: number): string {
  const hw = Math.max(1, halfWidth(s, y));
  const nx = (x + 0.5 - s.cx) / hw;
  const below = (y + 0.5 - s.cheek) / (s.chin + 1 - s.cheek);
  // The temple turns away under the hair, the cheekbone catches the light, the jaw turns under.
  const turn = y + 0.5 <= s.cheek ? 0.18 * ((s.cheek - y) / (s.cheek - s.top)) : 0;
  const bone = 0.2 * Math.exp(-(((y + 0.5 - (s.cheek + 2)) / 3.2) ** 2));
  const jaw = below > 0 ? 0.55 * below ** 1.6 : 0;
  const lit = 0.72 - Math.max(0, nx) ** 2 * 0.95 + bone - turn - jaw - Math.max(0, nx) * jaw * 0.6;
  if (lit < 0.02) return "s";
  if (lit < 0.3) return "S";
  return "f";
}

/** The near ear, lit; its right column lands on the head's outline. */
const EAR = Pic.of(`
  .KK.
  KffK
  KfkK
  KfkK
  KffK
  .KfK
  ..KK
`);
/** The far ear in shade, mirrored. */
const EAR_FAR = EAR.flipX().swap("f", "S");

/** Ears hang at the sides of the head from row `y`. */
function ears(pic: Pic, s: HeadShape, y: number): void {
  const mid = y + 3;
  const left = Math.ceil(s.cx - halfWidth(s, mid));
  const right = Math.floor(s.cx + halfWidth(s, mid) - 1);
  pic.put(EAR, left - 3, y);
  pic.put(EAR_FAR, right, y);
}

export interface BustOptions {
  readonly shape?: HeadShape;
  /** Row of the ears' top. */
  readonly ears?: number;
  /** Neck width, centred. */
  readonly neck?: number;
}

/**
 * A head, ears and neck, lit and outlined, on a 48×48 picture. Clothes go over the neck's foot,
 * hair over the top of the head, features last.
 */
export function bust(opt: BustOptions = {}): Pic {
  const s = opt.shape ?? HEADS.student;
  const pic = Pic.blank(PORTRAIT, PORTRAIT);
  const isIn = insideHead(s);
  // Neck first, so the jaw outline draws over its top.
  const nw = opt.neck ?? 10;
  const nx0 = Math.round(s.cx - nw / 2);
  for (let y = s.chin - 4; y < PORTRAIT; y++) {
    for (let x = nx0; x < nx0 + nw; x++) {
      const under = y <= s.chin + 3;
      const right = x >= nx0 + nw - 3;
      pic.set(x, y, x === nx0 || x === nx0 + nw - 1 ? "K" : under || right ? "s" : "S");
    }
  }
  for (let y = 0; y < PORTRAIT; y++) {
    for (let x = 0; x < PORTRAIT; x++) {
      if (!isIn(x, y)) continue;
      const edge = !isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1);
      pic.set(x, y, edge ? "K" : skinTone(s, x, y));
    }
  }
  ears(pic, s, opt.ears ?? s.cheek - 3);
  return tidyFace(pic);
}

/** Folds single shade pixels into their neighbours so the skin has no noise. */
function tidyFace(pic: Pic): Pic {
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < pic.h; y++) {
      for (let x = 0; x < pic.w; x++) {
        const ch = pic.at(x, y);
        if (ch !== "S" && ch !== "s" && ch !== "f") continue;
        let same = 0;
        const count = new Map<string, number>();
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const n = pic.at(x + dx, y + dy);
          if (n === ch) same++;
          if (n === "S" || n === "s" || n === "f") count.set(n, (count.get(n) ?? 0) + 1);
        }
        if (same > 0) continue;
        const best = [...count].sort((a, b) => b[1] - a[1])[0];
        if (best) pic.set(x, y, best[0]);
      }
    }
  }
  return pic;
}

/**
 * Hair, a hat or goggles cast a shadow on the skin right below them, down and to the right:
 * every skin pixel under one of `casters` within `depth` rows takes the shade.
 */
export function castShadow(pic: Pic, casters: string, depth = 2): Pic {
  const out = pic.clone();
  for (let y = 0; y < pic.h; y++) {
    for (let x = 0; x < pic.w; x++) {
      if (pic.at(x, y) !== "f") continue;
      for (let d = 1; d <= depth; d++) {
        const a = pic.at(x - Math.min(1, d - 1), y - d) as string;
        if (casters.includes(a)) {
          out.set(x, y, "S");
          break;
        }
      }
    }
  }
  return out;
}

// Features -----------------------------------------------------------------------------------

/** Rows of the eyes' top line and the columns of the left eye's and right eye's outer edges. */
export interface EyeLine {
  readonly y: number;
  /** Left edge of the left eye. The right eye mirrors it about the head's centre. */
  readonly x: number;
}

export const EYE_LINE = {
  student: { y: 23, x: 13 },
  adult: { y: 23, x: 14 },
  broad: { y: 24, x: 14 },
} as const satisfies Record<string, EyeLine>;

/**
 * Left eyes, drawn as the viewer sees them; the right eye is the mirror. The glint is placed
 * afterwards at the iris's top left in both eyes, so light stays at the top left.
 */
export const EYES = {
  /** Big, open, a student's: lash line, white at the outer corner, a two-tone iris. */
  open: `
    .eeeeee
    eeiiiie
    .o^iIie
    .oiIIie
    .oIIIie
    ..eeee.
  `,
  /** Rounder and higher: surprised, eager. */
  wide: `
    ..eeee.
    .eiiiie
    eo^iIio
    eoiIIio
    eoIIIio
    .eIIIe.
    ..eee..
  `,
  /** Lids down to the iris's middle: tired, unimpressed, calm. */
  lidded: `
    .......
    .......
    eeeeeee
    .e^IIie
    ..eeee.
  `,
  /** An adult's narrower eye. */
  calm: `
    .......
    .eeeee.
    eeiiiie
    .o^IIie
    ..eeee.
  `,
  /** Smiling shut: an arc. */
  shut: `
    .......
    .......
    ..eee..
    .e...e.
    e.....e
  `,
  /** Shut flat: asleep, blinking. */
  closed: `
    .......
    .......
    .......
    eeeeeee
    .e...e.
  `,
  /** Narrowed with a hard top line: stern, sharp. */
  sharp: `
    .......
    eeeee..
    .eeeeee
    .o^IIie
    ..eeee.
  `,
} as const;
export type EyeKind = keyof typeof EYES;

/** Brows by mood, left brow as seen; `B` is replaced with the brow colour. */
export const BROWS = {
  soft: `
    .BBBB.
    B.....
  `,
  flat: `
    BBBBBB
  `,
  up: `
    ..BBB.
    BB....
  `,
  stern: `
    BB....
    .BBBBB
  `,
  worried: `
    ...BBB
    .BB...
  `,
} as const;
export type BrowKind = keyof typeof BROWS;

/** Mouths, centred on the head. `k` lines, `M` the inside, `w` teeth, `t` tongue. */
export const MOUTHS = {
  /** A short level line. */
  line: `
    kkkk
  `,
  /** Closed, the corners up. */
  smile: `
    k....k
    .kkkk.
  `,
  /** A small closed smile. */
  soft: `
    k..k
    .kk.
  `,
  /** Wide open, teeth showing: the grin. */
  grin: `
    kkkkkkk
    kwwwwwk
    .kMttk.
    ..kkk..
  `,
  /** Talking, mid-word. */
  talk: `
    kkkkk
    .kMk.
  `,
  /** Open and delighted. */
  beam: `
    kkkkk
    kMMMk
    .kkk.
  `,
  /** A small o. */
  o: `
    .kk.
    kMMk
    .kk.
  `,
  /** Pressed flat with the corners down. */
  frown: `
    .kkkk.
    k....k
  `,
  /** Slightly open, asleep. */
  slack: `
    .kk..
    kMMk.
    .kk..
  `,
} as const;
export type MouthKind = keyof typeof MOUTHS;

export interface Features {
  readonly line?: EyeLine;
  readonly eyes: EyeKind;
  readonly brows?: BrowKind;
  /** Rows the brows sit above the eye line. Defaults to 2. */
  readonly browLift?: number;
  readonly mouth: MouthKind;
  /** Row of the mouth's top. */
  readonly mouthY?: number;
  /** Nudges the mouth sideways, for a lopsided look. */
  readonly mouthX?: number;
  readonly cx?: number;
  /** Adds a nose shadow. */
  readonly nose?: boolean;
  readonly blush?: boolean;
}

/**
 * Mirrors a left eye into a right eye, keeping its glint at the iris's top left: light comes
 * from one side for both eyes.
 */
function mirrorEye(left: Pic): Pic {
  const right = left.flipX();
  const irisLeft = (p: Pic, y: number): number => {
    for (let x = 0; x < p.w; x++) if ("iI^".includes(p.at(x, y) as string)) return x;
    return -1;
  };
  for (let y = 0; y < left.h; y++) {
    const gx = [...Array(left.w).keys()].find((x) => left.at(x, y) === "^");
    if (gx === undefined) continue;
    const dx = gx - irisLeft(left, y);
    right.set(left.w - 1 - gx, y, "i");
    right.set(irisLeft(right, y) + dx, y, "^");
  }
  return right;
}

/** Draws eyes, brows, nose, mouth and blush onto a bust. `brow` names the brow colour letter. */
export function features(pic: Pic, f: Features, brow = "X"): Pic {
  const line = f.line ?? EYE_LINE.student;
  const cx = f.cx ?? 24;
  const left = Pic.of(EYES[f.eyes]);
  const right = mirrorEye(left);
  const lx = line.x;
  const rx = Math.round(2 * cx - lx - left.w);
  pic.put(left, lx, line.y);
  pic.put(right, rx, line.y);
  if (f.brows) {
    const b = Pic.of(BROWS[f.brows]).swap("B", brow);
    const by = line.y - (f.browLift ?? 2);
    pic.put(b, lx + 1, by, { onto: "fSsK" });
    pic.put(b.flipX(), Math.round(2 * cx - lx - 1 - b.w), by, { onto: "fSsK" });
  }
  if (f.nose ?? true) {
    pic.set(cx, line.y + 7, "n");
  }
  if (f.blush) {
    pic.put("''", lx + 1, line.y + 7, { onto: "fS" });
    pic.put("''", Math.round(2 * cx - lx - 3), line.y + 7, { onto: "fS" });
  }
  const m = Pic.of(MOUTHS[f.mouth]);
  const my = f.mouthY ?? line.y + 10;
  pic.put(m, Math.round(cx - m.w / 2) + (f.mouthX ?? 0), my);
  return pic;
}

// Hair -----------------------------------------------------------------------------------------

type Pt = readonly [x: number, y: number];

/** Point in polygon, tested at the pixel's centre. */
export function inPolygon(poly: readonly Pt[], x: number, y: number): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] as Pt;
    const [xj, yj] = poly[j] as Pt;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Height of a polyline at column `x`, linear between points; below its ends it is the end's. */
function lineAt(line: readonly Pt[], x: number): number {
  const cx = x + 0.5;
  const first = line[0] as Pt;
  const last = line[line.length - 1] as Pt;
  if (cx <= first[0]) return first[1];
  if (cx >= last[0]) return last[1];
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1] as Pt;
    const [x1, y1] = line[i] as Pt;
    if (cx <= x1) return y0 + ((y1 - y0) * (cx - x0)) / Math.max(0.001, x1 - x0);
  }
  return last[1];
}

export interface HairSpec {
  /** Ellipses that make the mass. */
  readonly mass: readonly Lobe[];
  /** Polygons added to the mass: tufts, locks, a ponytail. */
  readonly add?: readonly (readonly Pt[])[];
  /** Polygons cut from the mass: a parting, the gap under a hat brim. */
  readonly cut?: readonly (readonly Pt[])[];
  /**
   * Where the hair ends, left to right: hair shows above this line. Zigzag it for locks; drop it
   * at the sides for hair over the ears or down the back.
   */
  readonly fringe?: readonly Pt[];
  /** Strand lines, each a polyline drawn in the dark step: the gaps between locks. */
  readonly strands?: readonly (readonly Pt[])[];
  /** Hand-placed highlight strokes: `[x, y, "HYY"]`, drawn only onto hair. */
  readonly shine?: readonly (readonly [number, number, string])[];
  /** How far the lit and shaded rims reach in. */
  readonly reach?: { readonly light: number; readonly dark: number };
}

/** Draws a line of `ch` between points, one pixel thick. */
function polyline(pic: Pic, pts: readonly Pt[], ch: string, onto: string): void {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1] as Pt;
    const [x1, y1] = pts[i] as Pt;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n);
      const y = Math.round(y0 + ((y1 - y0) * k) / n);
      if (onto.includes(pic.at(x, y) as string)) pic.set(x, y, ch);
    }
  }
}

/**
 * A head of hair in the hair letters `X x h H Y`, lit from the top left: outline, a shaded
 * underside, lit rims, strands between the locks and a few highlight strokes.
 */
export function hair(spec: HairSpec): Pic {
  const mass = lobes(spec.mass);
  const isIn = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= PORTRAIT || y >= PORTRAIT) return false;
    let on = mass(x, y) || (spec.add ?? []).some((p) => inPolygon(p, x, y));
    if (on && (spec.cut ?? []).some((p) => inPolygon(p, x, y))) on = false;
    if (on && spec.fringe && y + 0.5 > lineAt(spec.fringe, x)) on = false;
    return on;
  };
  const pic = shade(
    PORTRAIT,
    PORTRAIT,
    isIn,
    { outline: "X", dark: "x", mid: "h", light: "H" },
    spec.reach ?? { light: 2, dark: 2 },
  );
  for (const s of spec.strands ?? []) polyline(pic, s, "x", "hHY");
  for (const [x, y, stroke] of spec.shine ?? []) pic.put(stroke, x, y, { onto: "hHx" });
  return tidy(pic, "h", "X");
}

// Clothes --------------------------------------------------------------------------------------

/**
 * Builds a symmetric bust of clothes from its lit left half (24 columns): the right half is the
 * mirror, each lit letter swapped for its shaded one by `shadeOf`.
 */
export function mirrored(
  leftHalf: string,
  shadeOf: Readonly<Record<string, string>>,
  y: number,
): Pic {
  const half = Pic.of(leftHalf);
  const out = Pic.blank(PORTRAIT, PORTRAIT);
  out.put(half, 0, y);
  const right = half.flipX();
  for (let yy = 0; yy < right.h; yy++) {
    for (let xx = 0; xx < right.w; xx++) {
      const ch = right.at(xx, yy) as string;
      right.set(xx, yy, shadeOf[ch] ?? ch);
    }
  }
  out.put(right, 24, y);
  return out;
}

/**
 * Layers drawn over hair and skin leave stray single pixels at their edges. Each stray pixel of
 * the listed letters takes the letter most of its neighbours have.
 */
function mend(pic: Pic, letters: string): Pic {
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < pic.h; y++) {
      for (let x = 0; x < pic.w; x++) {
        const ch = pic.at(x, y) as string;
        if (!letters.includes(ch)) continue;
        const rim = [pic.at(x - 1, y), pic.at(x + 1, y), pic.at(x, y - 1), pic.at(x, y + 1)].some(
          (n) => n === undefined || n === ".",
        );
        if (rim) continue;
        const around = new Map<string, number>();
        let paired = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const n = pic.at(x + dx, y + dy);
            if (n === ch) paired = true;
            if (n !== undefined && n !== "." && letters.includes(n))
              around.set(n, (around.get(n) ?? 0) + 1);
          }
        }
        if (paired) continue;
        const best = [...around].sort((a, b) => b[1] - a[1])[0];
        if (best) pic.set(x, y, best[0]);
      }
    }
  }
  return pic;
}

// Whole portraits ------------------------------------------------------------------------------

/** A picture at the origin, or placed at `[x, y]`, optionally only onto cells holding `onto`. */
export type Layer = Pic | readonly [Pic | string, number, number, string?];

function place(pic: Pic, layer: Layer): void {
  if (layer instanceof Pic) pic.put(layer, 0, 0);
  else pic.put(layer[0], layer[1], layer[2], layer[3] ? { onto: layer[3] } : {});
}

/** One expression: features, plus layers only this face has (a pen raised, a whistle). */
export interface Face extends Omit<Features, "line"> {
  readonly under?: readonly Layer[];
  readonly over?: readonly Layer[];
}

export interface PortraitDef {
  readonly head: keyof typeof HEADS;
  readonly ears?: number;
  readonly neck?: number;
  /** Hair or a hood behind the head. */
  readonly back?: readonly Layer[];
  /** Hair over the head. */
  readonly front: readonly Layer[];
  /** Letters that cast a shadow on the skin below them. Defaults to the hair's dark steps. */
  readonly casters?: string;
  readonly clothes: readonly Layer[];
  /** Drawn over the clothes, under the features: the one item, collars, pins. */
  readonly items?: readonly Layer[];
  /** Drawn last, over the eyes: glasses, goggles worn down. */
  readonly over?: readonly Layer[];
  /** Brow colour letter. Defaults to the hair's dark step. */
  readonly brow?: string;
  readonly faces: Readonly<Record<string, Face>>;
  /** More letters whose stray pixels are mended, for hats and hoods drawn with `hair`. */
  readonly mend?: string;
}

/**
 * Every expression of one person as full 48×48 grids, layered the same way for the whole
 * cast: back hair, head, front hair and its shadow, clothes, items, features, then glasses.
 */
export function portraitFrames(def: PortraitDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, f] of Object.entries(def.faces)) {
    let p = Pic.blank(PORTRAIT, PORTRAIT);
    for (const l of def.back ?? []) place(p, l);
    p.put(
      bust({
        shape: HEADS[def.head],
        ...(def.ears !== undefined ? { ears: def.ears } : {}),
        ...(def.neck ? { neck: def.neck } : {}),
      }),
      0,
      0,
    );
    for (const l of def.front) place(p, l);
    p = castShadow(p, def.casters ?? "Xx");
    for (const l of def.clothes) place(p, l);
    for (const l of def.items ?? []) place(p, l);
    for (const l of f.under ?? []) place(p, l);
    p = features(p, { line: EYE_LINE[def.head], ...f }, def.brow ?? "x");
    for (const l of def.over ?? []) place(p, l);
    for (const l of f.over ?? []) place(p, l);
    out[name] = mend(p, `XxhHYKkSsf${def.mend ?? ""}`).toString();
  }
  return out;
}

/** Letters of the school uniform: navy blazer `N b v V`, white shirt `G q p w`, red tie `R r m`. */
export const UNIFORM_LEGEND = {
  N: "navy.deep",
  b: "navy.dark",
  v: "navy.mid",
  V: "navy.light",
  G: "stone.deep",
  q: "stone.light",
  p: "stone.pale",
  w: "stone.bright",
  R: "red.deep",
  r: "red.dark",
  m: "red.mid",
} as const;

/** The 동복 blazer over a white collar and the red tie, from the shoulders down. */
export function uniform(): Pic {
  return mirrored(
    `
      ........................
      ...............GGGG.....
      ...........NNNNGwwG.....
      ........NNNVVVVGwwwwG...
      .....NNNVVVVVVvGwwwwwGRm
      ...NNVVVVVVVVvvGpwwwwGRm
      ..NVVVVVVvvvvvvvGpwwwGRm
      .NVVVVVvvvvvvvvvGpwwwGRm
      NVVVVvvvvvvvvvvvvGpwwGRm
      NVVVvvvvvvvvvvvvvGpwwGRm
      NNNNNNNNNNNNNNNNNNNNNRRR
    `,
    { V: "v", v: "b", w: "p", p: "q", m: "r" },
    37,
  );
}

/**
 * The 과잠, a class jacket worn open over the shirt and tie: body in the class colour `J j c C`
 * (deep to light), cream sleeves `G q p w`, a ribbed band down the opening.
 */
export function varsity(): Pic {
  return mirrored(
    `
      ........................
      ...............JJJJ.....
      ...........JJJJJCwwJ....
      ........GGGJCCCJCwwwwG..
      .....GGGwwGJCCccJCwwwwGR
      ...GGwwwwpGJCcccJCpwwwGR
      ..GwwwwppGJCccccJCpwwwGR
      .GwwwwpppGJCccccJCpwwwGR
      GwwwwpppGJCcccccJCppwwGR
      GwwwppppGJCcccccJCppwwGR
      GGGGGGGGJJJJJJJJJJGGGGGR
    `,
    { C: "c", c: "j", w: "p", p: "q", m: "r" },
    37,
  );
}
