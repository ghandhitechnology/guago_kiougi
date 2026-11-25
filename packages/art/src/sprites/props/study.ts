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
 * 자습실, 가설관 4F: rows of 독서실 carrels in green felt, each with a shelf and the lamp under
 * it, the 졸방대 where you stand when your head starts to drop, and by the door the water
 * cooler with the log book everyone signs on the way out of their seat.
 */

// Carrel ----------------------------------------------------------------------------------------

/** Carrels are 26 wide with their outline and sit 25 apart, sharing the outline column. */
const CW = 26;
const CH = 34;

type Desk = "bare" | "books" | "study" | "asleep" | "gone" | "notes";

/** Spines standing on the shelf: colour pairs, left to right, each two pixels wide. */
const SPINES: Readonly<Record<string, string>> = {
  bare: "",
  books: "NnRrWwGgNn",
  study: "RrNnTtwwRrGg",
  asleep: "NnwwGgRr",
  gone: "RrNnGgwwTt",
  notes: "wwNnRr",
};

function carrel(kind: Desk, lamp: "on" | "off", breath = false): Pic {
  const p = Pic.blank(CW, CH);
  // Front partition: wood cap, green felt face.
  rect(p, 1, 1, CW - 2, 1, "W");
  rect(p, 1, 2, CW - 2, 1, "U");
  rect(p, 1, 3, CW - 2, 12, "6");
  // Felt texture: a faint weave.
  for (let y = 4; y < 15; y += 3)
    for (let x = 4 + (y % 2); x < CW - 4; x += 5) p.set(x, y, "D").set(x + 1, y, "D");
  // Shelf with books on it.
  const spines = SPINES[kind] ?? "";
  [...spines].forEach((ch, i) => {
    const x = 4 + i;
    const top = 3 + ((i >> 1) % 3 === 1 ? 1 : 0);
    vline(p, x, top, 9 - top, ch);
  });
  hline(p, 3, 9, CW - 6, "W");
  hline(p, 3, 10, CW - 6, "U");
  // The lamp under the shelf and the light it throws on the felt.
  if (lamp === "on") {
    hline(p, 4, 11, CW - 8, "Y");
    rect(p, 3, 12, CW - 6, 3, "s");
  } else {
    hline(p, 4, 11, CW - 8, "K");
  }
  // Desk top.
  rect(p, 1, 15, CW - 2, 9, lamp === "on" ? "P" : "W");
  hline(p, 1, 15, CW - 2, lamp === "on" ? "W" : "u");
  hline(p, 1, 23, CW - 2, "u");
  // Desk front.
  rect(p, 1, 24, CW - 2, 9, "u");
  hline(p, 1, 24, CW - 2, "U");
  hline(p, 1, 32, CW - 2, "U");
  // Side partitions: thin edges seen from above, down to the floor.
  for (const x of [1, CW - 3]) {
    vline(p, x, 1, 32, "W");
    vline(p, x + 1, 1, 32, "u");
  }
  vline(p, CW - 2, 1, 32, "U");
  // What is on the desk.
  if (kind === "study") {
    // An open workbook, a pencil case, a tumbler.
    rect(p, 6, 16, 10, 6, "w");
    vline(p, 11, 16, 6, "K");
    hline(p, 7, 18, 3, "K");
    hline(p, 7, 20, 3, "K");
    hline(p, 13, 18, 2, "K");
    rect(p, 17, 19, 4, 2, "x");
    hline(p, 17, 21, 4, "X");
    rect(p, 4, 16, 2, 4, "K");
    vline(p, 5, 16, 4, "M");
  }
  if (kind === "notes") {
    // Somebody lives here: sticky notes all over the felt, a photo, a timetable.
    for (const [x, y, c] of [
      [14, 3, "Y"],
      [17, 4, "+"],
      [20, 3, "Y"],
      [15, 12, "c"],
    ] as const)
      rect(p, x, y, 3, 3, c);
    rect(p, 4, 12, 5, 3, "w");
    rect(p, 5, 13, 3, 1, "n");
    rect(p, 8, 17, 9, 4, "6");
    hline(p, 8, 17, 9, "s");
  }
  if (kind === "books") {
    rect(p, 5, 17, 8, 2, "N");
    rect(p, 5, 19, 8, 2, "R");
    rect(p, 6, 21, 7, 1, "G");
    rect(p, 16, 18, 4, 3, "w");
  }
  if (kind === "gone") {
    // Gone to the 졸방대: the book face down, the chair pushed back.
    rect(p, 8, 17, 9, 4, "R");
    hline(p, 8, 21, 9, "Q");
    rect(p, 18, 16, 3, 5, "K");
    vline(p, 20, 16, 5, "M");
  }
  if (kind === "asleep") {
    // Head down on folded arms, the lamp still on, a pen rolled away.
    rect(p, 5, 19, 16, 4, "N");
    hline(p, 5, 19, 16, "n");
    rect(p, 8, 15, 10, 6, "j");
    rect(p, 9, 15, 6, 2, "I");
    hline(p, 8, 21, 10, "J");
    // Shoulders and back in front of the desk.
    rect(p, 5, 23, 16, 10, "N");
    rect(p, 6, 23, 14, 2, "n");
    vline(p, 13, 25, 8, "v");
    vline(p, 19, 24, 9, "v");
    rect(p, 11, 22, 4, 1, "w");
    hline(p, 20, 17, 3, "R");
    // Breathing: the back rises a pixel.
    if (breath) {
      for (let y = 22; y < 33; y++)
        for (let x = 5; x < 21; x++) p.set(x, y - 1, p.at(x, y) as string);
      hline(p, 5, 32, 16, "N");
    }
  }
  return finish(p, "Y+c");
}

const carrelShadow = boxShadow(CW, CH, 1, 24, CW - 2, CH - 1, 2, 0);

const carrels = sprite({
  name: "carrel",
  group: "interior",
  size: [CW, CH],
  palette: IL,
  lone: "Y+c",
  shadow: carrelShadow,
  frames: {
    bare: carrel("bare", "off").toString(),
    books: carrel("books", "off").toString(),
    notes: carrel("notes", "off").toString(),
    gone: carrel("gone", "off").toString(),
    study: carrel("study", "on").toString(),
    "study-off": carrel("study", "off").toString(),
    asleep0: carrel("asleep", "on").toString(),
    asleep1: carrel("asleep", "on", true).toString(),
  },
  anim: {
    idle: { frames: ["bare"], fps: 1 },
    asleep: { frames: ["asleep0", "asleep0", "asleep1", "asleep1"], fps: 2 },
  },
});

// Chair -----------------------------------------------------------------------------------------

/** A cushioned study chair on casters, seen from behind (`back`), the front, or reclined. */
function chair(kind: "back" | "front" | "recline"): Pic {
  const p = Pic.blank(14, 20);
  if (kind === "back") {
    rect(p, 2, 1, 10, 9, "N");
    hline(p, 3, 1, 8, "n");
    vline(p, 2, 2, 7, "n");
    vline(p, 11, 2, 8, "v");
    hline(p, 3, 9, 8, "v");
    rect(p, 1, 10, 12, 3, "v");
    hline(p, 1, 10, 12, "N");
  } else if (kind === "front") {
    rect(p, 2, 1, 10, 6, "v");
    hline(p, 3, 1, 8, "N");
    rect(p, 1, 7, 12, 5, "N");
    hline(p, 1, 7, 12, "n");
    hline(p, 1, 11, 12, "v");
  } else {
    // Tipped back as far as it goes: the backrest falls toward us.
    rect(p, 1, 4, 12, 6, "N");
    hline(p, 2, 4, 10, "n");
    rect(p, 1, 10, 12, 3, "v");
    hline(p, 1, 10, 12, "N");
  }
  rect(p, 6, 13, 2, 3, "i");
  vline(p, 6, 13, 3, "M");
  hline(p, 1, 16, 12, "i");
  hline(p, 1, 17, 12, "I");
  p.set(1, 18, "I")
    .set(2, 18, "I")
    .set(11, 18, "I")
    .set(12, 18, "I")
    .set(6, 18, "I")
    .set(7, 18, "I");
  return finish(p);
}

const chairs = sprite({
  name: "study-chair",
  group: "interior",
  size: [14, 20],
  palette: IL,
  shadow: ovalShadow(14, 20, 8, 18, 7, 2),
  frames: {
    back: chair("back").toString(),
    front: chair("front").toString(),
    recline: chair("recline").toString(),
  },
  anim: { idle: { frames: ["back"], fps: 1 } },
});

// 졸방대 --------------------------------------------------------------------------------------

/**
 * The tall desk: chest high, long enough for a row of sleepy people, its top a record of every
 * year that stood at it. Steel legs, a foot rail worn bright.
 */
function jolbang(w: number): Pic {
  const p = Pic.blank(w, 26);
  // Top slab.
  rect(p, 1, 1, w - 2, 9, "W");
  hline(p, 1, 1, w - 2, "P");
  vline(p, 1, 1, 9, "P");
  hline(p, 1, 10, w - 2, "u");
  hline(p, 1, 11, w - 2, "U");
  // Graffiti: carved lines, pen, a heart, a tally.
  const marks: [number, number, string][] = [
    [6, 3, "UU.U"],
    [14, 7, "nnn"],
    [22, 3, "U.U.U.U"],
    [30, 6, "RR"],
    [37, 7, "UUU"],
    [44, 3, "nn.n"],
    [50, 6, "U.UU"],
  ];
  for (const [x, y, m] of marks) {
    if (x + m.length >= w - 2) continue;
    [...m].forEach((ch, i) => {
      if (ch !== ".") p.set(x + i, y, ch).set(x + i, y + 1, ch === "U" ? "u" : ch);
    });
  }
  // Legs and rail.
  for (const x of [3, Math.floor(w / 2) - 1, w - 5]) {
    rect(p, x, 12, 2, 13, "M");
    vline(p, x, 12, 13, "K");
    p.set(x, 12, "S").set(x + 1, 12, "S");
  }
  rect(p, 3, 20, w - 6, 2, "K");
  hline(p, 3, 21, w - 6, "M");
  return finish(p);
}

const jolbangdae = sprite({
  name: "jolbangdae",
  group: "interior",
  size: [64, 26],
  palette: IL,
  shadow: boxShadow(64, 26, 2, 20, 61, 25, 3, 0),
  frames: { long: jolbang(64).toString() },
  anim: { idle: { frames: ["long"], fps: 1 } },
});

// Water cooler and the log book ----------------------------------------------------------------

/** A bottle-top cooler: the blue bottle, the white body, red and blue taps, the cup tube. */
function cooler(bubble: number, led: boolean): Pic {
  const p = Pic.blank(18, 38);
  // Bottle.
  rect(p, 3, 1, 10, 11, "n");
  hline(p, 4, 0, 8, "n");
  vline(p, 4, 1, 10, "m");
  vline(p, 5, 2, 3, "m");
  vline(p, 12, 1, 11, "N");
  hline(p, 3, 4, 10, "N");
  rect(p, 6, 12, 4, 2, "N");
  if (bubble >= 0) rect(p, 8, 9 - bubble * 2, 2, 2, "m");
  // Body.
  rect(p, 1, 14, 14, 3, "w");
  hline(p, 1, 14, 14, "w");
  rect(p, 1, 17, 14, 20, "k");
  vline(p, 14, 14, 23, "K");
  hline(p, 1, 36, 14, "K");
  // Tap recess and taps.
  rect(p, 3, 19, 10, 8, "M");
  hline(p, 3, 19, 10, "S");
  rect(p, 4, 20, 2, 2, "R");
  rect(p, 10, 20, 2, 2, "N");
  rect(p, 3, 25, 10, 2, "K");
  // Indicator.
  rect(p, 7, 29, 2, 1, led ? "c" : "8");
  // Vent lines.
  hline(p, 4, 32, 8, "K");
  hline(p, 4, 34, 8, "K");
  // Cup tube on the side.
  rect(p, 15, 17, 2, 12, "w");
  hline(p, 15, 29, 2, "K");
  return finish(p, "c8");
}

const waterCooler = sprite({
  name: "water-cooler",
  group: "interior",
  size: [18, 38],
  palette: IL,
  lone: "c8",
  shadow: boxShadow(18, 38, 1, 34, 16, 37, 2, 0),
  frames: {
    still: cooler(-1, true).toString(),
    glug0: cooler(0, true).toString(),
    glug1: cooler(1, true).toString(),
    glug2: cooler(2, false).toString(),
    glug3: cooler(3, true).toString(),
  },
  anim: {
    idle: { frames: ["still"], fps: 1 },
    glug: {
      frames: ["still", "still", "glug0", "glug1", "glug2", "glug3", "still", "still"],
      fps: 4,
    },
  },
});

/** The log book on its stand, open at tonight's page, the pen tied on with string. */
const logStand = (() => {
  const p = Pic.blank(16, 26);
  // Sloped top seen from above, the open book on it.
  rect(p, 1, 1, 14, 9, "u");
  hline(p, 1, 1, 14, "W");
  rect(p, 2, 2, 12, 7, "w");
  vline(p, 8, 2, 7, "K");
  for (let y = 3; y < 8; y += 2) {
    hline(p, 3, y, 4, "K");
    hline(p, 10, y, 3, "K");
  }
  hline(p, 10, 7, 2, "N");
  // Pen on its string.
  p.set(13, 9, "N").set(13, 10, "N");
  // Post and foot.
  rect(p, 1, 10, 14, 2, "U");
  rect(p, 6, 12, 4, 11, "u");
  vline(p, 9, 12, 11, "U");
  rect(p, 3, 23, 10, 2, "U");
  hline(p, 3, 23, 10, "u");
  return finish(p, "N");
})();

// Light fittings -------------------------------------------------------------------------------

/**
 * A fluorescent fitting hung on two wires. Overhead art: drawn above everyone, its floor spot
 * about 44 pixels below it.
 */
function tube(state: "on" | "off" | "dim"): Pic {
  const p = Pic.blank(36, 50);
  // Two long wires up to the ceiling.
  vline(p, 5, 0, 44, "S");
  vline(p, 30, 0, 44, "S");
  rect(p, 4, 0, 3, 1, "M");
  rect(p, 29, 0, 3, 1, "M");
  // Housing: its top in the light, its lip, the diffuser below.
  const y = 43;
  rect(p, 0, y, 36, 5, "d");
  rect(p, 1, y + 1, 34, 2, "k");
  hline(p, 1, y + 1, 34, "w");
  const glow = state === "on" ? "Y" : state === "dim" ? "y" : "K";
  rect(p, 1, y + 3, 34, 2, glow);
  hline(p, 1, y + 4, 34, state === "off" ? "M" : glow === "Y" ? "y" : "o");
  hline(p, 0, y + 6, 36, "d");
  return p;
}

const tubes = sprite({
  name: "tube-light",
  group: "interior",
  size: [36, 50],
  palette: IL,
  outline: false,
  frames: {
    on: tube("on").toString(),
    dim: tube("dim").toString(),
    off: tube("off").toString(),
  },
  anim: {
    idle: { frames: ["on"], fps: 1 },
    /** The one by the door that nobody has reported. */
    flicker: {
      frames: ["on", "on", "on", "dim", "on", "off", "on", "on", "on", "on", "dim", "dim", "on"],
      fps: 10,
    },
  },
});

/** A desk lamp: a weighted foot, a jointed arm, a shade with the bulb glowing under it. */
function deskLamp(on: boolean, frame: number): Pic {
  const p = Pic.blank(12, 16);
  rect(p, 1, 13, 7, 2, "M");
  hline(p, 1, 13, 7, "K");
  vline(p, 3, 7, 6, "S");
  vline(p, 4, 4, 4, "S");
  p.set(5, 4, "S").set(6, 3, "S");
  rect(p, 6, 1, 5, 3, "N");
  hline(p, 6, 1, 5, "n");
  if (on) {
    hline(p, 7, 4, 3, frame === 1 ? "y" : "Y");
  } else hline(p, 7, 4, 3, "K");
  return finish(p, "Yy");
}

const lamp = sprite({
  name: "desk-lamp",
  group: "interior",
  size: [12, 16],
  palette: IL,
  lone: "Yy",
  shadow: ovalShadow(12, 16, 5, 15, 4, 1.4),
  frames: {
    on: deskLamp(true, 0).toString(),
    hum: deskLamp(true, 1).toString(),
    off: deskLamp(false, 0).toString(),
  },
  anim: {
    idle: { frames: ["on"], fps: 1 },
    glow: { frames: ["on", "on", "on", "hum", "on", "on"], fps: 4 },
  },
});

// On the walls ---------------------------------------------------------------------------------

/** A wall clock reading 11:38, its red second hand going round. */
function clock(tick: number): Pic {
  const p = Pic.blank(16, 16);
  const c = 7.5;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d <= 7.6) p.set(x, y, d > 6.2 ? (x + y < 15 ? "K" : "M") : "w");
    }
  }
  const hand = (len: number, angle: number, ch: string) => {
    for (let t = 0; t <= len; t += 0.5) {
      const x = Math.round(c + Math.sin(angle) * t);
      const y = Math.round(c - Math.cos(angle) * t);
      if (p.at(x, y) === "w" || p.at(x, y) === "J" || p.at(x, y) === "R") p.set(x, y, ch);
    }
  };
  for (const a of [0, 3, 6, 9]) {
    const ang = (a / 12) * Math.PI * 2;
    p.set(Math.round(c + Math.sin(ang) * 5.4), Math.round(c - Math.cos(ang) * 5.4), "S");
  }
  hand(5, (38 / 60) * Math.PI * 2, "J");
  hand(3.4, ((11 + 38 / 60) / 12) * Math.PI * 2, "J");
  hand(5.5, (tick / 12) * Math.PI * 2, "R");
  return finish(p, "SRJ");
}

const wallClock = sprite({
  name: "wall-clock",
  group: "interior",
  size: [16, 16],
  origin: mounted([16, 16], 30),
  palette: IL,
  lone: "SRJ",
  frames: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${i}`, clock(i).toString()])),
  anim: {
    idle: { frames: ["s0"], fps: 1 },
    tick: { frames: Array.from({ length: 12 }, (_, i) => `s${i}`), fps: 1 },
  },
});

/** The 상벌점 ranking posted where the whole room can see it: a red header, names as lines. */
const ranking = (() => {
  const p = Pic.blank(14, 18);
  rect(p, 0, 0, 14, 18, "w");
  rect(p, 0, 0, 14, 3, "R");
  hline(p, 2, 1, 10, "!");
  for (let y = 5; y < 16; y += 2) {
    hline(p, 2, y, 2, "M");
    hline(p, 5, y, y < 8 ? 7 : 5 + (y % 3), "K");
  }
  vline(p, 13, 3, 15, "k");
  hline(p, 0, 17, 14, "k");
  rect(p, 0, 0, 2, 1, "k");
  rect(p, 12, 0, 2, 1, "k");
  return finish(p, "!");
})();

/** 비상구: a lit green sign over a door, the running figure. */
const exitSign = (() => {
  const p = Pic.blank(18, 9);
  rect(p, 0, 0, 18, 9, "c");
  rect(p, 1, 1, 16, 7, "c");
  // Door.
  rect(p, 12, 2, 4, 5, "w");
  // Figure running toward it.
  p.set(6, 2, "w").set(7, 2, "w");
  rect(p, 5, 3, 3, 2, "w");
  p.set(4, 5, "w").set(5, 5, "w").set(7, 5, "w").set(8, 5, "w");
  p.set(3, 6, "w").set(4, 6, "w").set(8, 6, "w").set(9, 6, "w");
  return finish(p);
})();

export default [
  carrels,
  chairs,
  jolbangdae,
  waterCooler,
  frames(
    "log-stand",
    { still: logStand },
    { lone: "N", shadow: boxShadow(16, 26, 3, 22, 12, 25, 2, 0) },
  ),
  tubes,
  lamp,
  wallClock,
  frames("ranking-sheet", { still: ranking }, { origin: mounted([14, 18], 18) }),
  frames("exit-sign", { still: exitSign }, { origin: mounted([18, 9], 38) }),
];
