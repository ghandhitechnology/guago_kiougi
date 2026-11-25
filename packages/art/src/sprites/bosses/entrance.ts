import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";
import { clean, ellipse, line, Pic, rect } from "./kit.ts";

/**
 * Boss entrance title cards (PLAN §16 "Boss entrances"): a strip torn from the 0조 연구노트,
 * black tape down the spine, a navy meander along the top and bottom, the wrong theory's emblem
 * in ink in the left box, and the ruled space right of the margin left for the name, which the
 * client sets in the bitmap font. As the card lands, a red pen circles the emblem: this is the
 * wrong answer. Frames: `card`, then `mark0` to `mark2` as the loop is drawn; the client holds
 * `mark2`. Origin top left, 224×56.
 *
 * The one-colour silhouettes for the palette drain are `boss-*-drain`, beside each boss.
 */

const W = 224;
const H = 56;
const BOX = 58;

/** The paper, spine, meander bands, margin and ruling. */
function paper(): Pic {
  const p = Pic.blank(W, H, "W");
  // Ruled lines and the pink margin.
  for (let y = 18; y < H - 8; y += 8) rect(p, BOX + 4, y, W - BOX - 10, 1, "s");
  rect(p, BOX + 2, 6, 1, H - 12, "P");
  // Meander along the top and bottom: the Greek key in navy, one 8 px repeat.
  const key = ["nnnnnnn.", "n.....n.", "n.nnn.n.", "n.n...n.", "nnn.nnnn"];
  for (const y0 of [1, H - 6]) {
    for (let x = 8; x < W - 2; x++) {
      for (let r = 0; r < key.length; r++) {
        const ch = (key[y0 === 1 ? r : key.length - 1 - r] as string)[(x - 8) % 8];
        if (ch === "n") p.set(x, y0 + r, "N");
      }
    }
  }
  // The spine: black tape.
  rect(p, 0, 0, 6, H, "k");
  rect(p, 1, 0, 1, H, "m");
  for (let y = 4; y < H; y += 9) rect(p, 2, y, 3, 1, "o");
  // The outline.
  for (let x = 0; x < W; x++) {
    p.set(x, 0, "o");
    p.set(x, H - 1, "o");
  }
  for (let y = 0; y < H; y++) {
    p.set(0, y, "o");
    p.set(W - 1, y, "o");
  }
  // A dog-eared corner, bottom right: cut, creased, the flap folded back in shade.
  for (let y = H - 9; y < H; y++)
    for (let x = W - 9; x < W; x++) {
      const u = W - 1 - x;
      const v = H - 1 - y;
      if (u + v < 7) p.set(x, y, ".");
      else if (u + v === 7) p.set(x, y, "o");
      else if (u + v <= 9 && u < 8 && v < 8) p.set(x, y, u + v === 8 ? "p" : "S");
    }
  return p;
}

/** A red-pen loop round the emblem, drawn `t` of the way round from the top. */
function loop(p: Pic, t: number, cx: number, cy: number, rx: number, ry: number): void {
  const steps = 160;
  for (let i = 0; i <= steps * t; i++) {
    const a = (i / steps) * Math.PI * 2.15 - Math.PI / 2;
    const wob = 1 + 0.06 * Math.sin(a * 3);
    const x = Math.round(cx + Math.cos(a) * rx * wob);
    const y = Math.round(cy + Math.sin(a) * ry * wob);
    p.set(x, y, "x");
    p.set(x + 1, y, "r");
  }
}

/** 만물은 정수의 비다: the tetractys in ten pebbles, and the unit square whose diagonal it cannot count. */
function pythagoreans(p: Pic): void {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c <= r; c++) {
      const x = 16 + (3 - r) * 3 + c * 6;
      const y = 12 + r * 6;
      rect(p, x, y, 3, 3, "k");
      p.set(x, y, "m");
    }
  rect(p, 40, 22, 12, 12, "k");
  rect(p, 41, 23, 10, 10, "W");
  for (let k = 0; k < 10; k += 2) {
    p.set(41 + k, 32 - k, "x");
    p.set(42 + k, 31 - k, "x");
  }
}
/** 운동은 모순이다: the race to the finish, cut in halves that never close. */
function zeno(p: Pic): void {
  rect(p, 12, 30, 40, 1, "k");
  rect(p, 12, 26, 1, 9, "k");
  rect(p, 52, 24, 2, 12, "k");
  let x = 12;
  let half = 20;
  for (let i = 0; i < 5; i++) {
    x += half;
    rect(p, x, 28, 1, 5, i % 2 ? "m" : "k");
    half = Math.max(1, Math.floor(half / 2));
  }
  // The arrow above, frozen at one instant.
  rect(p, 16, 17, 22, 1, "k");
  line(p, 36, 14, 41, 17, "k");
  line(p, 36, 20, 41, 17, "k");
  line(p, 37, 15, 37, 19, "k");
  line(p, 38, 16, 38, 18, "k");
  line(p, 12, 14, 16, 17, "m");
  line(p, 12, 20, 16, 17, "m");
  line(p, 14, 14, 18, 17, "m");
  line(p, 14, 20, 18, 17, "m");
}
/** The four spheres, a stone falling fast and a feather falling slow. */
function aristotle(p: Pic): void {
  for (const r of [6, 10, 14, 18]) {
    const ring = Pic.blank(W, H);
    ellipse(ring, 30, 28, r, r * 0.9, "k");
    ellipse(ring, 30, 28, r - 1, r * 0.9 - 1, ".");
    for (let y = 0; y < H; y++)
      for (let x = 0; x < BOX; x++) if (ring.at(x, y) === "k") p.set(x, y, r === 18 ? "m" : "k");
  }
  ellipse(p, 30, 28, 3, 3, "k");
  // Stone and feather beside the spheres, with fall marks of very different lengths.
  ellipse(p, 52, 40, 2.5, 2.5, "k");
  rect(p, 52, 30, 1, 6, "m");
  // The feather, high and slow.
  line(p, 8, 16, 14, 10, "k");
  line(p, 9, 16, 15, 10, "m");
  line(p, 9, 14, 13, 10, "m");
  rect(p, 11, 22, 1, 2, "m");
}

function card(
  draw: (p: Pic) => void,
  ring: [number, number, number, number],
): Record<string, string> {
  const base = paper();
  draw(base);
  const keep = "mxrPsSN";
  const frames: Record<string, string> = { card: clean(base.clone(), keep, "o").toString() };
  [0.35, 0.7, 1].forEach((t, i) => {
    const p = base.clone();
    loop(p, t, ...ring);
    frames[`mark${i}`] = clean(p, keep, "o").toString();
  });
  return frames;
}

const ui = {
  group: "page1-bosses",
  size: [W, H] as const,
  origin: [0, 0] as const,
  palette: UI,
  lone: "mxrPsSN",
  anim: {
    land: { frames: ["card", "mark0", "mark1", "mark2"], fps: 10, loop: false, jump: 1 },
  },
};

export default [
  sprite({ ...ui, name: "title-pythagoreans", frames: card(pythagoreans, [32, 27, 26, 20]) }),
  sprite({ ...ui, name: "title-zeno", frames: card(zeno, [32, 27, 26, 18]) }),
  sprite({ ...ui, name: "title-aristotle", frames: card(aristotle, [31, 28, 25, 22]) }),
];
