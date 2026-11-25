import { sprite } from "../../format.ts";
import {
  boxShadow,
  finish,
  frames,
  hline,
  IL,
  mounted,
  ovalShadow,
  rect,
  vline,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 실험동 floor by floor. 화학: the periodic table as colour, the goggles cabinet, the green
 * safety shower. 물리: a Van de Graaff with its silver dome, an air track with two carts, an
 * oscilloscope on a cart, and the third-floor door whose lock beeps every time, tally marks
 * thick on its frame. 생명: jars of things in fluid, seedlings under purple grow lights. The
 * empty first floor: chairs stacked and something under a tarp.
 */

/** The periodic table, as blocks of colour by group: nobody needs to read it from here. */
const periodic = (() => {
  const p = Pic.blank(44, 26);
  rect(p, 0, 0, 44, 26, "w");
  vline(p, 43, 1, 25, "K");
  hline(p, 1, 25, 43, "K");
  const cell = (cx: number, cy: number, c: string) => rect(p, 2 + cx * 2, 2 + cy * 3, 2, 2, c);
  for (let cy = 0; cy < 7; cy++) {
    for (let cx = 0; cx < 18; cx++) {
      const shown = cy === 0 ? cx === 0 || cx === 17 : cy < 3 ? cx < 2 || cx > 11 : true;
      if (!shown) continue;
      const c = cx < 2 ? "r" : cx > 16 ? "m" : cx > 11 ? "h" : "P";
      cell(cx, cy, c);
    }
  }
  // The two rows that always hang below.
  for (let cx = 3; cx < 17; cx++) rect(p, 2 + cx * 2, 22, 2, 2, "+");
  return finish(p);
})();

/** The goggles cabinet: UV-lit glass door, goggles on pegs, two missing. */
const goggles = (() => {
  const p = Pic.blank(28, 22);
  rect(p, 0, 0, 28, 22, "K");
  rect(p, 2, 2, 24, 18, "X");
  hline(p, 2, 2, 24, "x");
  for (let i = 0; i < 6; i++) {
    const x = 3 + i * 4;
    if (i === 2 || i === 4) {
      rect(p, x + 1, 6, 1, 2, "M");
      continue;
    }
    rect(p, x, 6, 3, 2, "c");
    hline(p, x, 8, 3, "I");
    rect(p, x, 13, 3, 2, "c");
    hline(p, x, 15, 3, "I");
  }
  for (let i = 0; i < 6; i++) p.set(5 + i, 17 - i, "%").set(6 + i, 17 - i, "%");
  return finish(p);
})();

/** The emergency shower and eyewash, the one bright green thing in the lab. */
const safetyShower = (() => {
  const p = Pic.blank(18, 46);
  vline(p, 8, 4, 38, "G");
  vline(p, 9, 4, 38, "D");
  rect(p, 3, 1, 12, 4, "G");
  hline(p, 3, 1, 12, "g");
  rect(p, 5, 5, 8, 2, "D");
  // Pull ring on its rod, the eyewash bowl.
  vline(p, 13, 7, 10, "K");
  rect(p, 12, 17, 3, 3, "g");
  rect(p, 4, 22, 10, 3, "g");
  hline(p, 4, 22, 10, "h");
  rect(p, 5, 25, 8, 2, "G");
  // A drain plate on the floor and the stand's foot.
  rect(p, 3, 42, 12, 3, "M");
  hline(p, 3, 42, 12, "K");
  return finish(p);
})();

/** A Van de Graaff generator: silver dome, belt column, a little discharge wand beside it. */
function vandegraaff(f: number): Pic {
  const p = Pic.blank(22, 38);
  // Dome.
  for (let y = 1; y < 14; y++) {
    for (let x = 2; x < 17; x++) {
      const d = Math.hypot(x + 0.5 - 9.5, y + 0.5 - 7.5);
      if (d <= 7) p.set(x, y, d > 5.6 ? (x + y < 15 ? "K" : "M") : x + y < 13 ? "w" : "k");
    }
  }
  rect(p, 6, 4, 2, 2, "w");
  // Column and base.
  rect(p, 7, 14, 5, 16, "m");
  vline(p, 7, 14, 16, "~");
  vline(p, 11, 14, 16, "n");
  rect(p, 3, 30, 13, 6, "I");
  hline(p, 3, 30, 13, "i");
  // The wand, and a spark when it is close.
  vline(p, 18, 10, 24, "K");
  rect(p, 17, 8, 3, 3, "M");
  if (f === 1) {
    p.set(17, 7, "Y").set(16, 6, "Y").set(15, 7, "Y");
  }
  return finish(p, "Y");
}

/** An air track on its bench: two carts, a photogate, the blower hose. */
const airTrack = (() => {
  const W = 76;
  const p = Pic.blank(W, 28);
  // Bench.
  rect(p, 1, 10, W - 2, 10, "u");
  hline(p, 1, 10, W - 2, "W");
  rect(p, 1, 20, W - 2, 3, "U");
  for (const x of [3, W - 6]) rect(p, x, 23, 3, 4, "M");
  // The track: an aluminium beam with its rows of holes.
  rect(p, 4, 8, W - 8, 4, "K");
  hline(p, 4, 8, W - 8, "k");
  for (let x = 6; x < W - 6; x += 3) p.set(x, 10, "S");
  // Two carts, a photogate arch.
  rect(p, 16, 4, 10, 5, "R");
  hline(p, 16, 4, 10, "r");
  rect(p, 46, 4, 10, 5, "N");
  hline(p, 46, 4, 10, "n");
  rect(p, 34, 1, 2, 8, "I");
  rect(p, 40, 1, 2, 8, "I");
  hline(p, 34, 1, 8, "I");
  p.set(36, 3, "r").set(37, 3, "r");
  // The blower and its hose.
  rect(p, 66, 13, 7, 6, "M");
  for (let i = 0; i < 6; i++) p.set(65 - i, 12 - Math.floor(i / 2), "I");
  return finish(p, "r");
})();

/** An oscilloscope on its cart, a green trace sliding across. */
function scopeCart(f: number): Pic {
  const p = Pic.blank(26, 34);
  rect(p, 2, 2, 22, 14, "K");
  hline(p, 2, 2, 22, "k");
  rect(p, 4, 4, 12, 9, "5");
  for (let x = 0; x < 12; x++) {
    const y = 8 + Math.round(Math.sin((x + f * 3) * 0.7) * 2.5);
    p.set(4 + x, y, "h");
  }
  for (const [x, y] of [
    [18, 5],
    [21, 5],
    [18, 9],
    [21, 9],
  ] as const)
    rect(p, x, y, 2, 2, "S");
  rect(p, 18, 12, 4, 1, "R");
  // Cables to a probe hanging off.
  for (let i = 0; i < 5; i++) p.set(23 + (i % 2), 14 + i, "I");
  // Cart.
  rect(p, 1, 16, 24, 3, "M");
  hline(p, 1, 16, 24, "K");
  for (const x of [2, 21]) vline(p, x, 19, 12, "M");
  hline(p, 2, 26, 21, "M");
  rect(p, 5, 22, 14, 4, "I");
  rect(p, 2, 31, 3, 2, "I");
  rect(p, 20, 31, 3, 2, "I");
  return finish(p, "h");
}

/**
 * 실험동 3층 문: a lab door with a keypad that beeps on every entry. The frame is thick with tally
 * marks, five to a bundle, from everyone who stepped out and came back in.
 */
function beepDoor(f: number): Pic {
  const p = Pic.blank(26, 40);
  rect(p, 0, 0, 26, 40, "S");
  rect(p, 1, 1, 24, 39, "K");
  rect(p, 4, 3, 18, 37, "n");
  vline(p, 4, 3, 37, "m");
  vline(p, 21, 3, 37, "N");
  rect(p, 8, 7, 10, 12, "j");
  hline(p, 9, 9, 8, "v");
  rect(p, 17, 22, 3, 2, "K");
  // Keypad with its LED.
  rect(p, 22, 16, 3, 7, "I");
  rect(p, 23, 17, 1, 1, f === 1 ? "r" : "q");
  for (let y = 19; y < 22; y++) p.set(23, y, "i");
  // Tallies on the frame, bundles of five.
  for (let b = 0; b < 6; b++) {
    const y = 5 + b * 5;
    for (const x of [1, 2]) vline(p, x, y, 3, "M");
    p.set(1, y + 3, "M").set(2, y + 2, "M");
  }
  hline(p, 0, 39, 26, "I");
  return finish(p, "rq");
}

/** Specimen shelf: jars in pale fluid, something coiled in one, a skull in another. */
const specimens = (() => {
  const W = 40;
  const p = Pic.blank(W, 48);
  rect(p, 1, 1, W - 2, 4, "M");
  hline(p, 1, 1, W - 2, "K");
  rect(p, 1, 5, W - 2, 42, "S");
  rect(p, 3, 6, W - 6, 38, "I");
  for (const y of [17, 29, 41]) {
    rect(p, 3, y, W - 6, 2, "K");
    hline(p, 3, y, W - 6, "k");
  }
  const jar = (x: number, base: number, w: number, h: number, fluid: string, thing: string) => {
    rect(p, x, base - h, w, h, fluid);
    vline(p, x, base - h, h, "w");
    rect(p, x, base - h - 2, w, 2, "M");
    rect(p, x + 1, base - Math.floor(h / 2) - 1, w - 2, 3, thing);
  };
  jar(5, 17, 6, 9, "P", "p");
  jar(13, 17, 5, 7, "~", "G");
  jar(21, 17, 7, 10, "P", "t");
  jar(30, 17, 5, 8, "~", "+");
  jar(5, 29, 8, 10, "~", "w");
  jar(15, 29, 5, 7, "P", "D");
  jar(23, 29, 9, 9, "P", "C");
  jar(6, 41, 6, 8, "~", "X");
  jar(16, 41, 6, 9, "P", "G");
  jar(25, 41, 8, 8, "~", "p");
  return finish(p);
})();

/** A grow rack: seedling trays on three shelves under purple lights. */
function growRack(f: number): Pic {
  const W = 38;
  const p = Pic.blank(W, 44);
  for (const x of [1, W - 4]) {
    rect(p, x, 1, 3, 42, "M");
    vline(p, x, 1, 42, "K");
  }
  for (const y of [3, 17, 31]) {
    // The light bar and its glow.
    rect(p, 4, y, W - 8, 2, f === 1 ? "x" : "%");
    rect(p, 4, y + 2, W - 8, 1, "X");
    // Trays of seedlings.
    rect(p, 5, y + 9, W - 10, 3, "b");
    hline(p, 5, y + 9, W - 10, "U");
    for (let x = 6; x < W - 6; x += 3) {
      vline(p, x, y + 6, 3, "g");
      p.set(x - 1, y + 6, "h").set(x + 1, y + 6, "h");
    }
    hline(p, 4, y + 12, W - 8, "K");
  }
  return finish(p, "h");
}

/** Something under a tarp on the empty first floor, nobody remembers what. */
const tarp = (() => {
  const p = Pic.blank(36, 28);
  rect(p, 3, 4, 30, 22, "N");
  hline(p, 4, 3, 28, "n");
  vline(p, 3, 4, 22, "n");
  vline(p, 32, 4, 22, "v");
  for (const x of [11, 19, 26]) vline(p, x, 5, 20, "v");
  rect(p, 8, 2, 10, 2, "n");
  // A rope round it, a corner of steel showing.
  hline(p, 3, 14, 30, "W");
  rect(p, 29, 22, 4, 4, "K");
  rect(p, 1, 24, 34, 3, "N");
  hline(p, 1, 26, 34, "v");
  return finish(p);
})();

/** Chairs stacked six high, legs every which way. */
const stackedChairs = (() => {
  const p = Pic.blank(18, 36);
  for (let k = 0; k < 6; k++) {
    const y = 26 - k * 4;
    rect(p, 2, y, 12, 3, "u");
    hline(p, 2, y, 12, "W");
    rect(p, 3, y - 4, 10, 4, "u");
    hline(p, 3, y - 4, 10, "W");
  }
  for (const x of [2, 13]) {
    vline(p, x, 29, 6, "6");
    vline(p, x + 1, 29, 6, "D");
  }
  return finish(p);
})();

const VDG = sprite({
  name: "van-de-graaff",
  group: "interior",
  size: [22, 38],
  palette: IL,
  lone: "Y",
  shadow: ovalShadow(22, 38, 10, 36, 7, 1.6),
  frames: { still: vandegraaff(0).toString(), spark: vandegraaff(1).toString() },
  anim: {
    idle: { frames: ["still"], fps: 1 },
    spark: { frames: ["still", "still", "still", "spark", "still", "spark"], fps: 4 },
  },
});

export default [
  frames("periodic-table", { still: periodic }, { origin: mounted([44, 26], 14) }),
  frames("goggles-cabinet", { still: goggles }, { origin: mounted([28, 22], 18) }),
  frames("safety-shower", { still: safetyShower }, { shadow: ovalShadow(18, 46, 9, 44, 7, 1.6) }),
  VDG,
  frames(
    "air-track",
    { still: airTrack },
    { lone: "r", shadow: boxShadow(76, 28, 1, 20, 74, 27, 3, 0) },
  ),
  frames(
    "scope-cart",
    { t0: scopeCart(0), t1: scopeCart(1), t2: scopeCart(2) },
    {
      lone: "h",
      shadow: boxShadow(26, 34, 1, 29, 24, 33, 2, 0),
      anim: { idle: { frames: ["t0"], fps: 1 }, trace: { frames: ["t0", "t1", "t2"], fps: 5 } },
    },
  ),
  frames(
    "beep-door",
    { led0: beepDoor(0), led1: beepDoor(1) },
    {
      lone: "rq",
      origin: mounted([26, 40], 0),
      anim: { idle: { frames: ["led0"], fps: 1 }, blink: { frames: ["led0", "led1"], fps: 1 } },
    },
  ),
  frames(
    "specimen-shelf",
    { still: specimens },
    { shadow: boxShadow(40, 48, 1, 42, 38, 47, 2, 0) },
  ),
  frames(
    "grow-rack",
    { on0: growRack(0), on1: growRack(1) },
    {
      lone: "h",
      shadow: boxShadow(38, 44, 1, 38, 36, 43, 2, 0),
      anim: { idle: { frames: ["on0"], fps: 1 }, hum: { frames: ["on0", "on1"], fps: 1 } },
    },
  ),
  frames("tarp", { still: tarp }, { shadow: boxShadow(36, 28, 1, 22, 34, 27, 3, 0) }),
  frames("stacked-chairs", { still: stackedChairs }, { shadow: ovalShadow(18, 36, 9, 34, 7, 1.5) }),
];
