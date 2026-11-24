import { sprite } from "../../format.ts";

/**
 * 유리수 병사: a hoplite of the Pythagorean order. Everything is a ratio of whole numbers, so the
 * shield carries a ÷ and the spear is a ruler with its ticks marked. Rigid and easily offended:
 * between steps it snaps back to attention and polishes the shield until it shines.
 */
export default sprite({
  name: "rational",
  size: [16, 24],
  palette: {
    ".": null,
    D: "gold.deep",
    d: "gold.dark",
    a: "gold.mid",
    A: "gold.light",
    R: "red.deep",
    r: "red.dark",
    m: "red.mid",
    M: "red.light",
    W: "wood.deep",
    o: "wood.mid",
    b: "wood.light",
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    e: "ink.deep",
    "^": "stone.bright",
    "*": "gold.light",
  },
  lone: "^*",
  parts: {
    spear: {
      at: [12, 1],
      grid: `
        .GG.
        GwqG
        GwqG
        .GG.
        WWWW
        WbbW
        WbWW
        WbbW
        WbWW
        WbbW
        WbWW
        WbbW
        WbWW
        WbbW
        WbWW
        WbbW
        WbWW
        WbbW
        WbWW
        WbbW
        WbWW
        WWWW
      `,
    },
    head: {
      at: [4, 1],
      grid: `
        ...RR...
        ..RmmR..
        ..RmmR..
        .DDRRDD.
        DaAAaadD
        DaAaaadD
        DaeeeedD
        DaeaaedD
        .DaeedD.
        ..DDDD..
      `,
    },
    body: {
      at: [3, 10],
      grid: `
        ..DDDDDD..
        .DaAAaadDD
        .DaAaaadaD
        .DaaaaddaD
        .RmmRmmRDD
        .RRRRRRRR.
        ..DaD.DaD.
        ..DaD.DaD.
        ..DaD.DaD.
        ..DaD.DaD.
        .DDDD.DDDD
      `,
    },
    stepA: {
      at: [3, 10],
      grid: `
        ..DDDDDD..
        .DaAAaadDD
        .DaAaaadaD
        .DaaaaddaD
        .RmmRmmRDD
        .RRRRRRRR.
        ..DaD.DaD.
        ..DaD.DaD.
        ..DDD.DaD.
        ......DaD.
        ......DDDD
      `,
    },
    stepB: {
      at: [3, 10],
      grid: `
        ..DDDDDD..
        .DaAAaadDD
        .DaAaaadaD
        .DaaaaddaD
        .RmmRmmRDD
        .RRRRRRRR.
        ..DaD.DaD.
        ..DaD.DaD.
        ..DaD.DDD.
        ..DaD.....
        .DDDD.....
      `,
    },
    shield: {
      at: [0, 9],
      grid: `
        ..DDDD..
        .DwwwpD.
        DwwrrppD
        DwwwwppD
        DwrrrrpD
        DwwwwppD
        DwwrrppD
        .DwwppD.
        ..DDDD..
      `,
    },
    shine: {
      at: [0, 9],
      grid: `
        ........
        ..^.....
        .^......
        ........
        ........
        ........
        ........
        ........
        ........
      `,
    },
    shine2: {
      at: [0, 9],
      grid: `
        ........
        ........
        ........
        ......^.
        .....^..
        ........
        ........
        ........
        ........
      `,
    },
    // Hit and death.
    halfTop: {
      at: [0, 8],
      grid: `
        ..DDDD..
        .DwwwpD.
        DwwrrppD
        DwwwwppD
        DDDDDDDD
      `,
    },
    halfBottom: {
      at: [0, 14],
      grid: `
        DDDDDDDD
        DwwwwppD
        DwwrrppD
        .DwwppD.
        ..DDDD..
      `,
    },
    fallen: {
      at: [2, 16],
      grid: `
        ...DDDDDD...
        ..DaaAAddD..
        .RRmmmmmmRR.
        DDDDDDDDDDDD
        ..DDD..DDD..
      `,
    },
    helmet: {
      at: [9, 18],
      grid: `
        ..RR..
        .DDDD.
        DaaddD
        DaaddD
        .DDDD.
      `,
    },
    bits: {
      at: [0, 2],
      grid: `
        ...*..........*.
        ................
        .*..............
        ...............*
        ................
        ......*.........
      `,
    },
  },
  frames: {
    idle0: ["spear", "body", "head", "shield"],
    idle1: [["spear", 0, -1], "body", "head", "shield"],
    idle2: ["spear", "body", ["head", -1, 1], "shield", "shine"],
    idle3: ["spear", "body", ["head", -1, 1], "shield", "shine2"],
    walk0: [
      ["spear", 0, -1],
      ["stepA", 0, 0],
      ["head", 0, -1],
      ["shield", 0, -1],
    ],
    walk1: ["spear", "body", "head", "shield"],
    walk2: [
      ["spear", 0, -1],
      ["stepB", 0, 0],
      ["head", 0, -1],
      ["shield", 0, -1],
    ],
    walk3: ["spear", "body", "head", "shield"],
    hit: [["spear", 0, -1], "body", ["head", 1, 0], ["shield", 1, -2]],
    die0: ["spear", "body", "head", ["halfTop", 0, 0], ["halfBottom", 0, 0]],
    die1: ["fallen", "helmet", ["halfTop", 0, -2], ["halfBottom", 0, 4]],
    die2: ["fallen", "helmet", "bits"],
  },
  anim: {
    idle: {
      frames: ["idle0", "idle0", "idle1", "idle0", "idle0", "idle2", "idle3", "idle2", "idle0"],
      fps: 4,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 8 },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 10, loop: false, jump: 1 },
  },
});
