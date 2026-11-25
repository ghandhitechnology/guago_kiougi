import { sprite } from "../../format.ts";

/**
 * 유리수 병사: a hoplite of the Pythagorean order. Everything is a ratio of whole numbers, so the
 * shield carries a ÷ and the spear is a ruler with its ticks marked. Rigid and easily offended:
 * between steps it snaps back to attention and polishes the shield until it shines.
 *
 * 방패형: it faces its target and the shield is always in front, so the side you must not hit
 * from is the side the ÷ is on. Braced, it crouches behind the shield with the ruler levelled
 * over the rim; a hit on the shield flashes it white and shoves the soldier back a step.
 */
export default sprite({
  name: "rational",
  size: [24, 24],
  origin: [8, 23],
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
      at: [0, 1],
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
        .DaaaddddD
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
        .DaaaddddD
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
        .DaaaddddD
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
      at: [10, 9],
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
      at: [10, 9],
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
      at: [10, 9],
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
    // Braced: crouched behind the shield, the ruler levelled over the rim at the target.
    level: {
      at: [0, 11],
      grid: `
        WWWWWWWWWWWWWWWWWWWW.GG.
        WbWbWbWbWbWbWbWbWbbWGwwG
        WbbbbbbbbbbbbbbbbbbWGqqG
        WWWWWWWWWWWWWWWWWWWW.GG.
      `,
    },
    brace: {
      at: [3, 11],
      grid: `
        ..DDDDDD..
        .DaAAaadDD
        .DaAaaaddD
        .DaaaddddD
        .RmmRmmRDD
        .RRRRRRRR.
        .DaD..DaD.
        DaD...DaD.
        DaD...DaD.
        DDDD..DDDD
      `,
    },
    // A hit on the shield: the face flashes white and the soldier is shoved back.
    flash: {
      at: [11, 8],
      grid: `
        ..DDDD..
        .DwwwwD.
        DwwwwwwD
        DwwwwwwD
        DwwwwwwD
        DwwwwwwD
        DwwwwwwD
        .DwwwwD.
        ..DDDD..
      `,
    },
    sparks: {
      at: [19, 5],
      grid: `
        ..*.
        *...
        ...*
        .*..
        ....
        ..*.
      `,
    },
    // Hit and death.
    halfTop: {
      at: [10, 8],
      grid: `
        ..DDDD..
        .DwwwpD.
        DwwrrppD
        DwwwwppD
        DDDDDDDD
      `,
    },
    halfBottom: {
      at: [10, 14],
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
      at: [12, 18],
      grid: `
        ..RR..
        .DDDD.
        DaaddD
        DaaddD
        .DDDD.
      `,
    },
    bits: {
      at: [3, 2],
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
    idle2: ["spear", "body", ["head", 1, 1], "shield", "shine"],
    idle3: ["spear", "body", ["head", 1, 1], "shield", "shine2"],
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
    guard0: ["level", "brace", ["head", 1, 2], ["shield", 2, -1]],
    guard1: [["level", 0, 1], "brace", ["head", 1, 2], ["shield", 2, 0]],
    block0: ["level", ["brace", -1, 0], ["head", 0, 2], "flash", "sparks"],
    block1: [
      ["level", 0, 1],
      ["brace", -1, 0],
      ["head", -1, 3],
      ["shield", 1, -1],
    ],
    hit: [
      ["spear", 1, -1],
      ["body", 1, 0],
      ["head", 2, 0],
      ["shield", 2, -2],
    ],
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
    move: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 8 },
    guard: { frames: ["guard0", "guard0", "guard1", "guard1"], fps: 4 },
    block: { frames: ["block0", "block1", "guard0"], fps: 10, loop: false },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 10, loop: false, jump: 1 },
  },
});
