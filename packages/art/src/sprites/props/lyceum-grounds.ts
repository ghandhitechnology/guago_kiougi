import { finish, hline, ovalShadow, rect, vline } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";
import { door, hall, roof, wall, window } from "./agora-town.ts";

/**
 * The 리케이온's own buildings and grounds: the lecture hall whose face is its columns, a
 * syllabus on each; the long library; the drop tower, a stone shaft with a crane arm and a basket
 * of stones hanging over the yard, a pennant at the top so it shows from anywhere; the frozen
 * pool with its kerb, its cracks, frost creeping out over the paving and cold coming off it; the
 * four places the elements keep (scorched ground, a wet hollow with reeds, grass combed flat by
 * wind with streamers, an outcrop of rock); and the lawn's wear: mowing stripes, duelling rings,
 * and what students leave behind.
 */

// Buildings ------------------------------------------------------------------------------------

/** The long library: plaster, a row of high windows, a double door with a scroll cut over it. */
function library(): Pic {
  const W = 368;
  const H = 74;
  const p = Pic.blank(W, H);
  roof(p, 2, W - 3, 4, 30, 8);
  wall(p, 4, W - 5, 31, H - 2, "white", 41);
  for (let x = 20; x < W - 20; x += 26) if (Math.abs(x - W / 2) > 24) window(p, x, 38);
  door(p, W / 2 - 10, H - 5, "N");
  door(p, W / 2 + 1, H - 5, "N");
  // The scroll over the door.
  p.put(
    `
      .uuuuuuuuuu.
      uWPPPPPPPPWu
      .UUUUUUUUUU.
    `,
    W / 2 - 6,
    33,
  );
  return finish(p, "y");
}

// The drop tower -------------------------------------------------------------------------------

const TW = 72;
const TH = 222;
const SHAFT = { x0: 20, x1: 44 };
const GALLERY = 38;

/**
 * A stone tower over the fall yard: an ashlar shaft, a timber gallery at the top with a rail, a
 * crane arm out over the yard with a basket of stones on its rope and a sack of feathers beside
 * it, and a pennant on a pole. The gallery and everything above it is overhead.
 */
function tower(top: boolean, frame: number): Pic {
  const p = Pic.blank(TW, TH);
  if (!top) {
    for (let y = GALLERY + 8; y < TH - 6; y++) {
      const taper = Math.round(((TH - y) / TH) * 3);
      for (let x = SHAFT.x0 + taper; x <= SHAFT.x1 - taper; x++) {
        const course = Math.floor(y / 6);
        const joint = y % 6 === 5 || (x + course * 5) % 10 === 0;
        let ch = x < SHAFT.x0 + taper + 3 ? "k" : x > SHAFT.x1 - taper - 4 ? "M" : "K";
        if (joint) ch = x > SHAFT.x1 - taper - 4 ? "S" : "V";
        p.set(x, y, ch);
      }
    }
    // A narrow door at the foot, slit windows up the shaft.
    rect(p, 28, TH - 26, 8, 20, "J");
    rect(p, 27, TH - 28, 10, 2, "K");
    for (let y = 70; y < TH - 40; y += 34) rect(p, 31, y, 2, 7, "J");
    // The plinth.
    rect(p, SHAFT.x0 - 5, TH - 6, SHAFT.x1 - SHAFT.x0 + 11, 6, "k");
    hline(p, SHAFT.x0 - 5, TH - 6, SHAFT.x1 - SHAFT.x0 + 11, "w");
    hline(p, SHAFT.x0 - 5, TH - 1, SHAFT.x1 - SHAFT.x0 + 11, "M");
    return finish(p);
  }
  // The gallery: a deck on brackets, a rail.
  rect(p, SHAFT.x0 - 8, GALLERY, SHAFT.x1 - SHAFT.x0 + 17, 5, "u");
  hline(p, SHAFT.x0 - 8, GALLERY, SHAFT.x1 - SHAFT.x0 + 17, "W");
  hline(p, SHAFT.x0 - 8, GALLERY + 4, SHAFT.x1 - SHAFT.x0 + 17, "b");
  for (let x = SHAFT.x0 - 6; x <= SHAFT.x1 + 6; x += 5) vline(p, x, GALLERY + 5, 4, "b");
  for (let x = SHAFT.x0 - 8; x <= SHAFT.x1 + 8; x += 4) vline(p, x, GALLERY - 9, 9, "U");
  hline(p, SHAFT.x0 - 8, GALLERY - 9, SHAFT.x1 - SHAFT.x0 + 17, "u");
  // A little roof over the gallery, and the pennant on its pole.
  roof(p, SHAFT.x0 - 6, SHAFT.x1 + 6, 16, 28, 6);
  vline(p, 32, 0, 17, "b");
  for (let y = 1; y < 8; y++) {
    const len = 14 - y + (frame && y > 3 ? 2 : 0);
    for (let x = 33; x < 33 + len; x++) p.set(x, y + (frame && x > 40 ? 1 : 0), y < 4 ? "R" : "q");
  }
  // The crane arm out east, its rope, the basket of stones; a sack of feathers on the rail.
  for (let k = 0; k < 26; k++) {
    p.set(SHAFT.x1 + 4 + k, GALLERY - 12 - Math.floor(k / 4), "U");
    p.set(SHAFT.x1 + 4 + k, GALLERY - 11 - Math.floor(k / 4), "b");
  }
  const rx = SHAFT.x1 + 28;
  vline(p, rx, GALLERY - 17, 30, "I");
  p.put(
    `
      .bbbbbb.
      bMKMKSMb
      bUuUuUub
      bUuUuUub
      .bbbbbb.
    `,
    rx - 3,
    GALLERY + 12,
  );
  p.put(
    `
      ..ww..
      .wkkw.
      wkkkkw
      wkkkKw
      .wKKw.
    `,
    SHAFT.x0 - 6,
    GALLERY - 6,
  );
  return finish(p, "IRq");
}

// The frozen pool --------------------------------------------------------------------------------

const ICE_W = 464;
const ICE_H = 80;

/**
 * The pool frozen through: a stone kerb round it, the ice a pale grey-white with a lilac cast and
 * long cracks, frost thickest at the rim, a sheen where the low sun catches it. Drawn raw: ice is
 * the colour of ice.
 */
function ice(): Pic {
  const p = Pic.blank(ICE_W, ICE_H);
  const k = 7;
  for (let y = 0; y < ICE_H; y++)
    for (let x = 0; x < ICE_W; x++) {
      const kerb = x < k || y < k || x >= ICE_W - k || y >= ICE_H - k;
      if (kerb) {
        const top = y < 3 || (x < k && x < 3);
        p.set(x, y, top ? "k" : y >= ICE_H - 3 ? "M" : x >= ICE_W - 3 ? "M" : "K");
        if ((x + Math.floor(y / 4) * 9) % 24 === 0) p.set(x, y, "V");
        continue;
      }
      // Slow bands of colour in the ice: grey-white, a lilac cast, a blue one in the deep middle.
      const n =
        Math.sin(x / 37 + y / 23) * 0.5 +
        Math.sin(x / 71 - y / 17 + 1.3) * 0.35 +
        (hash(x, y, 31) - 0.5) * 0.25;
      const rim = Math.min(x - k, y - k, ICE_W - k - 1 - x, ICE_H - k - 1 - y);
      let ch = n > 0.62 ? "m" : n > 0.12 ? "k" : n > -0.45 ? "K" : (x + y) % 2 ? "%" : "K";
      if (n > 0.5 && n <= 0.62 && (x + y) % 2) ch = "m";
      if (rim < 4 + Math.floor(hash(x, y, 2) * 4)) ch = hash(x, y, 5) > 0.3 ? "w" : "k";
      // The low sun's sheen, a long diagonal streak.
      if (Math.abs(x - 60 - (y - 10) * 6 - 120) < 10 && rim > 6) ch = "w";
      p.set(x, y, ch);
    }
  // Cracks, wandering and branching.
  for (const [x0, y0, len, seed] of [
    [60, 20, 140, 1],
    [210, 54, 120, 2],
    [330, 18, 100, 3],
    [140, 60, 70, 4],
  ] as const) {
    let x: number = x0;
    let y: number = y0;
    for (let s = 0; s < len; s++) {
      x += 1;
      y += hash(s, seed, 6) > 0.66 ? 1 : hash(s, seed, 7) > 0.66 ? -1 : 0;
      y = Math.max(k + 2, Math.min(ICE_H - k - 3, y));
      p.set(x, y, "X");
      if (hash(s, seed, 8) > 0.93)
        for (let b = 1; b < 8; b++) p.set(x + b, Math.round(y + (seed % 2 ? b : -b) / 2), "X");
    }
  }
  return p;
}

/** Frost creeping out from the pool over the paving: feathery white, fading out. */
function frost(seed: number): Pic {
  const W = 48;
  const H = 20;
  const p = Pic.blank(W, H);
  for (let i = 0; i < 9; i++) {
    let x = Math.floor(hash(i, seed) * W);
    let y = H - 1;
    for (let s = 0; s < 14; s++) {
      p.set(x, y, s < 6 ? "w" : "k");
      if (hash(s, i, seed) > 0.5) p.set(x + 1, y, "k");
      x += hash(s, i, seed + 1) > 0.5 ? 1 : -1;
      y -= 1;
      if (y < 0) break;
    }
  }
  return p;
}

/** Cold coming off the ice in slow wisps, four frames. */
function mist(frame: number): Pic {
  const p = Pic.blank(40, 16);
  for (let k = 0; k < 3; k++) {
    const x0 = ((k * 14 + frame * 3) % 40) - 4;
    for (let x = x0; x < x0 + 12; x++) {
      const y = 10 - k * 3 + Math.round(Math.sin((x + frame) / 3));
      if (x >= 0 && x < 40) p.set(x, y, "w").set(x, y + 1, k === 1 ? "w" : "m");
    }
  }
  return p;
}

// The element places -----------------------------------------------------------------------------

/** Scorched ground: grass burnt to char and ash, cracks with a glow left in them. */
function scorch(seed: number): Pic {
  const W = 120;
  const H = 68;
  const p = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d =
        Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)) +
        (hash(x >> 2, y >> 2, seed) - 0.5) * 0.5;
      if (d > 1) continue;
      if (d > 0.8 && hash(x, y, seed + 1) > 0.5) continue;
      let ch = d > 0.7 ? "b" : hash(x >> 1, y >> 1, seed + 2) > 0.55 ? "J" : "j";
      if (d < 0.7 && hash(x, y, seed + 3) > 0.94) ch = "M";
      p.set(x, y, ch);
    }
  for (let s = 0; s < 60; s++) {
    const x = Math.round(W / 2 - 30 + s + Math.sin(s / 3 + seed) * 3);
    const y = Math.round(H / 2 + Math.sin(s / 4 + seed) * 6);
    p.set(x, y, s % 5 === 0 ? "y" : "R");
  }
  return p;
}

/** A wet hollow: mud gone dark and shining, standing water in the low places. */
function wet(seed: number): Pic {
  const W = 120;
  const H = 68;
  const p = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d =
        Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)) +
        (hash(x >> 2, y >> 2, seed) - 0.5) * 0.4;
      if (d > 1) continue;
      if (d > 0.85 && hash(x, y, seed + 1) > 0.5) continue;
      let ch = d > 0.6 ? "b" : "B";
      if (d < 0.45) ch = hash(x >> 1, y, seed + 4) > 0.85 ? "c" : "8";
      else if (d < 0.55) ch = "9";
      p.set(x, y, ch);
    }
  return p;
}

/** A clump of reeds at the hollow's edge, bending by frame. */
function reeds(frame: number): Pic {
  const p = Pic.blank(20, 26);
  for (let k = 0; k < 7; k++) {
    const x0 = 2 + k * 2.5;
    const h = 14 + Math.floor(hash(k, 3) * 10);
    for (let y = 0; y < h; y++) {
      const bend = Math.round((y / h) ** 2 * (frame ? 3 : 1));
      p.set(Math.round(x0) + bend, 25 - y, y > h - 4 && k % 3 === 0 ? "b" : y < 5 ? "D" : "G");
    }
  }
  return finish(p, "bDG");
}

/** Grass combed flat by the wind, one way, in long streaks. */
function combed(seed: number): Pic {
  const W = 120;
  const H = 68;
  const p = Pic.blank(W, H);
  for (let i = 0; i < 70; i++) {
    const y = Math.floor(hash(i, seed) * H);
    const x0 = Math.floor(hash(seed, i) * (W - 20));
    const len = 8 + Math.floor(hash(i, i, seed) * 14);
    for (let x = x0; x < x0 + len; x++) {
      const yy = y + Math.round((x - x0) / 6);
      if (yy < H) p.set(x, yy, i % 3 === 0 ? "h" : "g");
    }
  }
  return p;
}

/** A tall pole with a streamer flying off it, three frames. */
function streamer(frame: number): Pic {
  const p = Pic.blank(30, 58);
  vline(p, 4, 6, 52, "b");
  vline(p, 5, 6, 52, "U");
  p.put(".kk.\nkwwk\n.kk.", 3, 3);
  for (let x = 6; x < 30; x++) {
    const y = 8 + Math.round(Math.sin((x + frame * 4) / 4) * 2 + (x - 6) / 5);
    p.set(x, y, x % 6 < 3 ? "m" : "w").set(x, y + 1, x % 6 < 3 ? "n" : "m");
  }
  return finish(p, "mnw");
}

/** An outcrop of bedrock breaking the lawn: flat slabs, split, lit on their tops. */
function outcrop(seed: number): Pic {
  const W = 120;
  const H = 68;
  const p = Pic.blank(W, H);
  for (let s = 0; s < 12; s++) {
    const cx = 10 + Math.floor(hash(s, seed) * (W - 20));
    const cy = 8 + Math.floor(hash(seed, s) * (H - 16));
    const rx = 6 + Math.floor(hash(s, s, seed) * 7);
    const ry = 3 + Math.floor(hash(s, seed, 2) * 3);
    for (let y = cy - ry - 2; y <= cy + ry + 2; y++)
      for (let x = cx - rx; x <= cx + rx; x++) {
        const top = Math.hypot((x - cx) / rx, (y - cy) / ry);
        const side = Math.hypot((x - cx) / rx, (y - cy - 2) / ry);
        if (top <= 1) p.set(x, y, top < 0.5 && x < cx ? "k" : "K");
        else if (side <= 1) p.set(x, y, "M");
      }
  }
  return finish(p);
}

// The fall yard ---------------------------------------------------------------------------------

/** A target chalked on the paving under the tower: rings and a cross, smudged where things hit. */
function target(): Pic {
  const W = 64;
  const H = 36;
  const p = Pic.blank(W, H);
  for (const r of [1, 0.66, 0.33])
    for (let k = 0; k < 160; k++) {
      const a = (k / 160) * Math.PI * 2;
      p.set(
        Math.round(W / 2 + Math.cos(a) * (W / 2 - 1) * r),
        Math.round(H / 2 + Math.sin(a) * (H / 2 - 1) * r),
        "w",
      );
    }
  for (let k = -6; k <= 6; k++)
    p.set(W / 2 + k, H / 2 + Math.round(k / 2), "w").set(W / 2 + k, H / 2 - Math.round(k / 2), "w");
  return p;
}

/** A dent knocked into the paving by something heavy, cracks running out from it. */
const DENT = `
  ....M.......M...
  .....M..SS.M....
  .MM...SSMMSS....
  ...MSSMMMMMSMM..
  ....SSMMMMSS....
  ...M..SSSS..M...
  ..M.........M...
`;

// The lawn's wear ----------------------------------------------------------------------------------

/** One stripe of mown lawn, the blades laid the other way, lighter. Joins end to end. */
function mown(): Pic {
  const p = Pic.blank(32, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) if ((x + 2 * y) % 4 === 0) p.set(x, y, "h");
  return p;
}

/** A ring worn into the lawn where pairs practise: bare earth round a scuffed middle. */
function duel(): Pic {
  const W = 80;
  const H = 48;
  const p = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = Math.hypot((x + 0.5 - W / 2) / (W / 2), (y + 0.5 - H / 2) / (H / 2));
      if (r > 1 || r < 0.78) {
        if (r < 0.5 && hash(x, y, 9) > 0.9) p.set(x, y, "u");
        continue;
      }
      if (hash(x, y, 4) > 0.25) p.set(x, y, r > 0.9 ? "u" : "W");
    }
  return p;
}

/** What students leave on the grass: a wax tablet, a sandal, a scroll, a satchel, an apple. */
const LEFT: Readonly<Record<string, string>> = {
  tablet: `
    bbbbbbbb
    b555556b
    b5DD5D6b
    b55DD56b
    bbbbbbbb
  `,
  sandal: `
    .bbbbb..
    bUuuuUb.
    bUbbbUUb
    .bbbbbb.
  `,
  scroll: `
    .uu.....uu.
    uWPPPPPPPWu
    uWPPPPPPPWu
    .uu.....uu.
  `,
  satchel: `
    ..bbbb..
    .b....b.
    bUUUUUUb
    bUuuuuUb
    bUUUUUUb
    .bbbbbb.
  `,
  apple: `
    ..b..
    .RRR.
    RrRRR
    RRRRq
    .Rqq.
  `,
};

export default [
  greek(
    "lecture-hall",
    { still: hall(16, true) },
    { lone: "IRw", shadow: ovalShadow(302, 92, 151, 90, 148, 3) },
  ),
  greek(
    "library",
    { still: library() },
    { lone: "y", origin: [184, 73], shadow: ovalShadow(368, 74, 184, 72, 180, 2) },
  ),
  greek(
    "drop-tower",
    { still: tower(false, 0) },
    { origin: [32, TH - 1], shadow: ovalShadow(TW, TH, 32, TH - 2, 26, 3) },
  ),
  greek(
    "drop-tower-top",
    { flap0: tower(true, 0), flap1: tower(true, 1) },
    { origin: [32, TH - 1], lone: "IRq", anim: { flap: { frames: ["flap0", "flap1"], fps: 2 } } },
  ),
  greek("ice-sheet", { still: ice() }, { origin: [0, 0], outline: false, lone: "wkm%XKMV" }),
  greek("frost", { a: frost(1), b: frost(2), c: frost(3) }, { outline: false, lone: "wk" }),
  greek(
    "ice-mist",
    { drift0: mist(0), drift1: mist(1), drift2: mist(2), drift3: mist(3) },
    {
      anim: { drift: { frames: ["drift0", "drift1", "drift2", "drift3"], fps: 3 } },
      outline: false,
      lone: "wm",
    },
  ),
  greek("scorch", { a: scorch(1), b: scorch(2), c: scorch(3) }, { outline: false, lone: "bJjMyR" }),
  greek("wet-hollow", { a: wet(1), b: wet(2) }, { outline: false, lone: "bB8c9" }),
  greek(
    "hollow-reeds",
    { bend0: reeds(0), bend1: reeds(1) },
    { anim: { bend: { frames: ["bend0", "bend1"], fps: 1.2 } }, lone: "bDG" },
  ),
  greek("combed", { a: combed(1), b: combed(2), c: combed(3) }, { outline: false, lone: "gh" }),
  greek(
    "streamer",
    { fly0: streamer(0), fly1: streamer(1), fly2: streamer(2) },
    {
      anim: { fly: { frames: ["fly0", "fly1", "fly2"], fps: 4 } },
      lone: "mnw",
      shadow: ovalShadow(30, 58, 5, 57, 3, 1.2),
    },
  ),
  greek(
    "outcrop",
    { a: outcrop(1), b: outcrop(2), c: outcrop(3) },
    { shadow: ovalShadow(120, 68, 60, 50, 56, 12) },
  ),
  greek("drop-target", { still: target() }, { outline: false, lone: "w" }),
  greek("dent", { still: Pic.of(DENT) }, { outline: false, lone: "MS" }),
  greek("mown", { still: mown() }, { origin: [0, 0], outline: false, lone: "h" }),
  greek("duel-ring", { still: duel() }, { outline: false, lone: "uW" }),
  greek(
    "left-behind",
    Object.fromEntries(
      Object.entries(LEFT).map(([k, g]) => [
        k,
        Pic.blank(11, 6).put(Pic.of(g), 0, 6 - Pic.of(g).h),
      ]),
    ),
    { lone: "5D6PWuURrqb" },
  ),
];
