import { finish, hline, ovalShadow, rect, vline } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";

/**
 * What the 아고라's people leave lying about and keep doing: a potter's wheel turning, the
 * barber's stool and basin, a child's hoop dropped in the dust, a dog asleep in the stoa's shade,
 * pigeons working the paving, fish drying on a rack, a cook's brazier and its smoke, a wall stuck
 * with potsherds that have names scratched on them, pennants strung across the market lane, a
 * vine on beams over the fountain, and a sack of beans the Pythagoreans have chalked a circle
 * round so nobody brings it nearer.
 */

/** A potter's kick wheel with a jar half thrown on it; the wheel's spokes turn by frame. */
function wheel(frame: number): Pic {
  const p = Pic.blank(24, 20);
  // The kick wheel below, an ellipse with a spoke that moves round.
  for (let y = 13; y < 19; y++)
    for (let x = 2; x < 22; x++) {
      const r = Math.hypot((x - 11.5) / 10, (y - 15.5) / 3);
      if (r <= 1) p.set(x, y, r > 0.75 ? "b" : "U");
    }
  const a = (frame / 4) * Math.PI * 2;
  for (let k = 1; k < 9; k++) {
    const x = Math.round(11.5 + Math.cos(a) * k);
    const y = Math.round(15.5 + Math.sin(a) * k * 0.3);
    p.set(x, y, "u");
  }
  vline(p, 11, 6, 8, "b");
  vline(p, 12, 6, 8, "U");
  // The wheel head and the clay on it.
  rect(p, 5, 6, 14, 2, "u");
  hline(p, 5, 6, 14, "W");
  p.put(
    `
      ..CTTC..
      .CtTTTC.
      CtTTTTTC
      CtTTTTCC
      .CTTTCC.
    `,
    8,
    0,
  );
  p.set(10 + (frame % 2), 2, "P").set(10 + (frame % 2), 3, "P");
  return finish(p, "uP");
}

/** The barber's corner: a stool, a basin on a tripod, a strop hanging, a folded cloth. */
const BARBER = `
  ...........KKKKKK...
  ..........KwkkkkkM..
  ..........K~cc99cM..
  ...bb......MKKKKM...
  ..bWUb.......IJ.....
  ..bUUb......I.J.I...
  .bbbbbb....I..J..I..
  .bWuuUb....I..J..I..
  .bUUUUb.............
  ..b..b..............
  ..b..b...xx%x.......
  ..b..b...XxxX.......
`;

/** A child's hoop and its stick, dropped in the dust. */
const HOOP = `
  ....bbbbb.....
  ..bb.....bb...
  .b.........b..
  b...........b.
  b...........bU
  .b.........bU.
  ..bb.....bbU..
  ....bbbbbU....
  ........U.....
`;

/** A dog asleep on its side; its flank rises and falls. */
function dog(frame: number): Pic {
  const p = Pic.blank(26, 12);
  const body = frame ? 0 : 1;
  p.put(
    `
      ..........uuuuuuuu......
      ........uuWWWWWWuuu.....
      .uu...uuWWuuuuuuuuuu....
      uWWuuuuuuuuuuuuuuuuuU...
      uWJuuuuuuuuuuuuuuuuUUUUb
      .uuuUuuuuuuuuuuuuuUUU..b
      ..UUUUUUUUUUUUUUUUU.....
      ...U..U.......U..U......
    `,
    1,
    2 + body,
  );
  if (frame) p.set(4, 3, "U");
  return finish(p, "J");
}

/** Three pigeons working the paving, heads down by turns. */
function pigeons(frame: number): Pic {
  const p = Pic.blank(30, 10);
  const bird = (x: number, down: boolean, flip: boolean) => {
    const g = down
      ? `
        ..KKKK...
        .KkkkKKM.
        M9KKKKMMm
        .MKKKMM..
        ...I.I...
      `
      : `
        .KK......
        Mk9KKK...
        .KkkkKKM.
        ..MKKKMMm
        ...I.I...
      `;
    const pic = Pic.of(g);
    p.put(flip ? pic.flipX() : pic, x, 4);
  };
  bird(0, frame === 0, false);
  bird(10, frame === 1, true);
  bird(20, frame === 2, false);
  return finish(p, "9mI");
}

/** A rack of fish drying in the sun: an A-frame, a pole, fish hung by their tails. */
function fishRack(frame: number): Pic {
  const p = Pic.blank(40, 34);
  for (let y = 4; y < 33; y++) {
    const k = (y - 4) / 29;
    p.set(Math.round(4 + k * -2) + 2, y, "U").set(Math.round(36 + k * 2) - 2, y, "U");
  }
  hline(p, 3, 4, 34, "b");
  hline(p, 3, 5, 34, "U");
  for (let i = 0; i < 6; i++) {
    const x = 7 + i * 5 + (frame && i % 2 ? 1 : 0);
    p.put(
      `
        .I.
        I~I
        ccc
        c9c
        c9c
        c9c
        .9.
        I.I
      `,
      x,
      6,
    );
  }
  return finish(p, "I~");
}

/** The cook's stall: a brazier of coals glowing by frame, skewers on it, bread on a board. */
function cook(frame: number): Pic {
  const p = Pic.blank(40, 30);
  // The brazier on three legs.
  rect(p, 4, 10, 20, 6, "I");
  hline(p, 4, 10, 20, "i");
  for (let x = 6; x < 22; x++)
    p.set(x, 11, (x + frame) % 3 === 0 ? "y" : (x + frame) % 3 === 1 ? "R" : "o");
  for (const x of [6, 14, 21]) vline(p, x, 16, 10, "I");
  // Skewers.
  for (let k = 0; k < 4; k++) {
    hline(p, 5 + k * 4, 8 - (k % 2), 10, "u");
    p.put("TCT", 7 + k * 4, 7 - (k % 2));
  }
  // The bread board on a trestle.
  rect(p, 26, 14, 13, 3, "u");
  hline(p, 26, 14, 13, "W");
  vline(p, 28, 17, 9, "U");
  vline(p, 36, 17, 9, "U");
  p.put(".PPP.PPP\nPpppPppP", 27, 12);
  return finish(p, "yRoI");
}

/** A wisp of smoke going up, in four frames. Raw: it is the colour of smoke anywhere. */
function smoke(frame: number): Pic {
  const p = Pic.blank(16, 40);
  for (let k = 0; k < 5; k++) {
    const y = 36 - ((k * 9 + frame * 3) % 40);
    const x = 7 + Math.round(Math.sin((y + frame) / 6) * 3);
    const r = 1.5 + (36 - y) / 14;
    for (let yy = Math.floor(y - r); yy <= y + r; yy++)
      for (let xx = Math.floor(x - r); xx <= x + r; xx++)
        if (Math.hypot(xx - x, yy - y) <= r && yy >= 0 && yy < 40 && xx >= 0 && xx < 16)
          p.set(xx, yy, Math.hypot(xx - x + 1, yy - y + 1) < r * 0.6 ? "k" : "K");
  }
  return p;
}

/** A wall stuck with potsherds, each with a name scratched on it: the town's votes and notices. */
function ostraka(): Pic {
  const W = 56;
  const H = 30;
  const p = Pic.blank(W, H);
  rect(p, 0, 2, W, 3, "k");
  hline(p, 0, 2, W, "w");
  rect(p, 0, 5, W, 22, "K");
  rect(p, 0, 25, W, 4, "M");
  for (let i = 0; i < 16; i++) {
    const x = 2 + Math.floor(hash(i, 1) * (W - 9));
    const y = 7 + Math.floor(hash(i, 2) * 14);
    p.put(
      `
        .CTT.
        CtJTT
        CTJJC
        .CC..
      `,
      x,
      y,
    );
  }
  return finish(p, "J");
}

/** Pennants on a rope strung across the lane, sagging, fluttering by frame. Overhead. */
function bunting(frame: number): Pic {
  const W = 64;
  const p = Pic.blank(W, 18);
  const sag = (x: number) => Math.round(2 + Math.sin((x / W) * Math.PI) * 5);
  for (let x = 0; x < W; x++) p.set(x, sag(x), "b");
  const colors = ["R", "N", "o", "D"];
  for (let i = 0; i < 8; i++) {
    const x0 = 2 + i * 8;
    const y0 = sag(x0 + 3) + 1;
    const c = colors[i % 4] as string;
    const lean = (frame + i) % 2;
    for (let r = 0; r < 7; r++) {
      const half = Math.max(0, 3 - Math.floor(r / 2));
      for (let x = x0 + 3 - half + (r > 3 ? lean : 0); x <= x0 + 3 + half + (r > 3 ? lean : 0); x++)
        p.set(x, y0 + r, c);
    }
  }
  return p;
}

/** A vine on beams: the posts stand (objects), the beams and leaves go overhead. */
const PERGOLA_W = 72;
const PERGOLA_H = 60;
function pergola(top: boolean): Pic {
  const p = Pic.blank(PERGOLA_W, PERGOLA_H);
  if (!top) {
    for (const x of [3, PERGOLA_W - 6]) {
      rect(p, x, 14, 4, PERGOLA_H - 15, "U");
      vline(p, x, 14, PERGOLA_H - 15, "u");
      vline(p, x + 3, 14, PERGOLA_H - 15, "b");
    }
    return finish(p);
  }
  for (const y of [10, 16]) {
    rect(p, 0, y, PERGOLA_W, 3, "U");
    hline(p, 0, y, PERGOLA_W, "u");
  }
  for (let x = 4; x < PERGOLA_W; x += 10) rect(p, x, 4, 3, 18, "U");
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < PERGOLA_W; x++) {
      const n = hash(x >> 1, y >> 1, 21);
      if (n > 0.5 + Math.abs(y - 12) / 24) p.set(x, y, n > 0.85 ? "g" : n > 0.7 ? "G" : "D");
    }
  for (let k = 0; k < 7; k++) {
    const x = 6 + Math.floor(hash(k, 31) * (PERGOLA_W - 12));
    p.put(".X.\nXxX\nXXX\n.X.", x, 16 + (k % 3));
  }
  return finish(p, "gx");
}

/** A sack of broad beans, its neck tied, set down outside a chalk circle. */
const BEAN_SACK = `
  ....uu....
  ...uWWu...
  ..uWuuUu..
  .uWuuuuUu.
  uWuuuuuuUu
  uuuuuuuuUu
  uuuuuuuUUu
  .uUUUUUUu.
  ..D3Dg3D..
`;

export default [
  greek(
    "potter-wheel",
    { spin0: wheel(0), spin1: wheel(1), spin2: wheel(2), spin3: wheel(3) },
    {
      anim: { spin: { frames: ["spin0", "spin1", "spin2", "spin3"], fps: 8 } },
      lone: "uP",
      shadow: ovalShadow(24, 20, 12, 18, 10, 2),
    },
  ),
  greek(
    "barber",
    { still: finish(Pic.of(BARBER), "~cI") },
    { lone: "~cIJxX%", shadow: ovalShadow(20, 12, 9, 11, 9, 1.5) },
  ),
  greek("toy-hoop", { still: Pic.of(HOOP) }, { outline: false, lone: "U" }),
  greek(
    "sleeping-dog",
    { breathe0: dog(0), breathe1: dog(1) },
    {
      anim: { breathe: { frames: ["breathe0", "breathe1"], fps: 1.4 } },
      lone: "J",
      shadow: ovalShadow(26, 12, 13, 10, 12, 1.6),
    },
  ),
  greek(
    "pigeons",
    { peck0: pigeons(0), peck1: pigeons(1), peck2: pigeons(2) },
    { anim: { peck: { frames: ["peck0", "peck1", "peck2"], fps: 3 } }, lone: "9mI" },
  ),
  greek(
    "fish-rack",
    { sway0: fishRack(0), sway1: fishRack(1) },
    {
      anim: { sway: { frames: ["sway0", "sway1"], fps: 1.5 } },
      lone: "I~",
      shadow: ovalShadow(40, 34, 20, 32, 18, 2),
    },
  ),
  greek(
    "cook-fire",
    { burn0: cook(0), burn1: cook(1), burn2: cook(2) },
    {
      anim: { burn: { frames: ["burn0", "burn1", "burn2"], fps: 5 } },
      lone: "yRoI",
      shadow: ovalShadow(40, 30, 20, 27, 18, 2),
    },
  ),
  greek(
    "smoke",
    { rise0: smoke(0), rise1: smoke(1), rise2: smoke(2), rise3: smoke(3) },
    {
      anim: { rise: { frames: ["rise0", "rise1", "rise2", "rise3"], fps: 4 } },
      outline: false,
      lone: "kK",
    },
  ),
  greek("ostraka", { still: ostraka() }, { lone: "J", shadow: ovalShadow(56, 30, 28, 28, 27, 2) }),
  greek(
    "bunting",
    { flap0: bunting(0), flap1: bunting(1) },
    { anim: { flap: { frames: ["flap0", "flap1"], fps: 2 } }, outline: false, origin: [0, 0] },
  ),
  greek("vine-posts", { still: pergola(false) }, { origin: [36, PERGOLA_H - 1] }),
  greek("vine-top", { still: pergola(true) }, { origin: [36, PERGOLA_H - 1], lone: "gx" }),
  greek(
    "bean-sack",
    { still: finish(Pic.of(BEAN_SACK), "Dg3") },
    { lone: "Dg3", shadow: ovalShadow(10, 9, 5, 8, 5, 1.2) },
  ),
];
