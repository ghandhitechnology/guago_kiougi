import { type SpriteDef, variant } from "../../format.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";
import { THEMES } from "../../palette.ts";
import campus from "./campus.ts";
import nightField from "./night-field.ts";

/**
 * The rift's far side, where students come out into the 아고라: a hole torn in the afternoon like
 * a page out of a notebook. Its rim is the paper, ruled in blue with the red margin running
 * through it, curling up in places with the sun on the curl and a shadow under it; inside lies
 * the 운동장 at 23:40, its lawn, the sand and the chalk line, a puddle with the night sky in it,
 * and the glow of the lamp that stands there. The hole is drawn whole, in its own colours (raw),
 * so the night inside never takes the town's daylight. The lamp and the goal standing in it are
 * the campus's own, recoloured with the campus night theme.
 */

const W = 184;
const H = 220;
const CX = 92;
const CY = 112;
const RX = 76;
const RY = 96;

/** Distance out of the hole's torn outline: below 1 inside, above 1 outside. */
function edge(x: number, y: number): number {
  const a = Math.atan2(y - CY, x - CX);
  const wobble =
    1 +
    Math.sin(a * 3 + 0.6) * 0.06 +
    Math.sin(a * 7 + 2.1) * 0.035 +
    (hash(Math.round(a * 40), 3, 5) - 0.5) * 0.05;
  return Math.hypot((x - CX) / RX, (y - CY) / RY) / wobble;
}

/** Where the lamp stands inside, and its pool of light. */
const LAMP: [number, number] = [118, 70];

function wound(): Pic {
  const p = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = edge(x, y);
      if (e <= 1) {
        // The night inside: lawn, a strip of 운동장 sand, chalk, lamplight.
        const lamp =
          Math.hypot((x - LAMP[0]) / 34, (y - LAMP[1] - 20) / 18) + (hash(x, y, 17) - 0.5) * 0.35;
        const sand = x > 52 + Math.sin(y / 17) * 6 && x < 108 + Math.sin(y / 13) * 5;
        const n = hash(x >> 1, y >> 1, 7);
        let ch: string;
        if (sand) ch = n > 0.86 ? "d" : n < 0.1 ? "V" : "S";
        else ch = n > 0.8 ? "D" : n < 0.12 ? "Z" : "5";
        if (lamp < 1) {
          if (sand) ch = lamp < 0.55 ? "K" : "M";
          else ch = lamp < 0.55 ? (n > 0.6 ? "6" : "G") : n > 0.5 ? "D" : "G";
        }
        // The chalk line, dim blue-white, down the middle of the sand.
        if (Math.abs(x - (80 + Math.sin(y / 15) * 2)) < 1.2 && (y + 3) % 9 < 7)
          ch = lamp < 1 ? "w" : "m";
        // The shadow of the paper lip falling into the hole along its top and left.
        if (edge(x - 5, y - 6) > 1) ch = "J";
        else if (edge(x - 3, y - 3) > 1) ch = sand ? "d" : "Z";
        p.set(x, y, ch);
        continue;
      }
      if (e < 1.11) {
        // The paper rim: white, ruled blue every eight pixels, the red margin, fibres at the tear.
        let ch = e < 1.025 ? "k" : "w";
        if (y % 8 === 0) ch = "n";
        if (Math.abs(x - 34) < 1) ch = "R";
        const tear = hash(x, y, 9);
        if (e > 1.08 && tear > 0.55) continue;
        if (e > 1.06 && tear > 0.8) ch = "k";
        p.set(x, y, ch);
        continue;
      }
      // The lip's shadow on the town's dust, under its lower right edge.
      if (e < 1.18 && edge(x - 5, y - 6) < 1.1) p.set(x, y, "T");
    }
  // A puddle in the lawn with stars in it.
  for (let y = 150; y < 166; y++)
    for (let x = 122; x < 150; x++)
      if (Math.hypot((x - 136) / 13, (y - 158) / 6) < 1) {
        const star = hash(x, y, 13) > 0.92;
        p.set(x, y, star ? "m" : "v");
      }
  // Flaps: the torn page peeling back off the hole at three places, a triangle of paper ruled on
  // its face with its turned-under edge in shade, and its shadow on the dust beneath.
  type V = readonly [number, number];
  const inTri = (x: number, y: number, a: V, b: V, c: V) => {
    const s1 = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const s2 = (c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0]);
    const s3 = (a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0]);
    return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  };
  const flaps: readonly (readonly [V, V, V])[] = [
    [
      [20, 52],
      [44, 22],
      [8, 18],
    ],
    [
      [166, 100],
      [168, 136],
      [182, 108],
    ],
    [
      [52, 204],
      [92, 210],
      [60, 219],
    ],
  ];
  for (const [a, b, c] of flaps)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (inTri(x - 3, y - 4, a, b, c) && !inTri(x, y, a, b, c) && edge(x, y) > 1.1)
          p.set(x, y, "T");
  for (const [a, b, c] of flaps)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!inTri(x, y, a, b, c)) continue;
        // Near the base it is the page's face; toward the tip it has turned and shows its back.
        const base = Math.hypot(x - (a[0] + b[0]) / 2, y - (a[1] + b[1]) / 2);
        const tip = Math.hypot(x - c[0], y - c[1]);
        let ch = tip < base * 0.6 ? "K" : y % 8 === 0 ? "n" : "w";
        if (tip < base * 0.3) ch = "M";
        p.set(x, y, ch);
      }
  return p;
}

const NIGHT = THEMES.find((t) => t.name === "campus-night")?.remap ?? {};

/** A campus prop in the night palette, for standing inside the hole. */
function night(list: readonly SpriteDef[], name: string, as: string): SpriteDef {
  const base = list.find((d) => d.kind === "sprite" && d.name === name) as SpriteDef;
  return { ...variant(base, { name: as, recolor: NIGHT }), group: "page1" };
}

export default [
  greek(
    "wound",
    { still: wound() },
    { origin: [CX, CY], outline: false, lone: "wkKnRmTJdVZD56GSMv" },
  ),
  night(campus as readonly SpriteDef[], "lamp", "night-lamp"),
  night(nightField as readonly SpriteDef[], "goal", "night-goal"),
];
