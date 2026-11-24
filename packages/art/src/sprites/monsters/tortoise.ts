import { sprite } from "../../format.ts";

/**
 * 제논의 거북이: the tortoise no one can catch. Serenely unhurried. Its shell is split into a half,
 * a quarter, an eighth and so on, and while it waits it pulls its head halfway in, then halfway
 * out again, smiling with its eyes shut.
 */
export default sprite({
  name: "tortoise",
  size: [24, 16],
  palette: {
    ".": null,
    "<": "board.deep",
    ">": "board.dark",
    "[": "board.mid",
    "]": "board.light",
    a: "gold.light",
    "1": "grass.deep",
    "2": "grass.dark",
    "3": "grass.mid",
    "4": "grass.light",
    e: "ink.deep",
    "-": "ink.deep",
    "~": "stone.pale",
  },
  lone: "-~",
  parts: {
    shell: {
      at: [3, 2],
      grid: `
        .....<<<<<<.....
        ...<<]]]]]]<<...
        ..<]]]]]]]>]]<..
        .<]]]]]]]]>]>]<.
        .<]]][[[[[>[>]<.
        <]][[[[[[[>[>><.
        <[[[[[[[[[>[>><.
        <>>>>>>>>>>>>><.
        <<<<<<<<<<<<<<<.
      `,
    },
    head: {
      at: [17, 5],
      grid: `
        .1111.
        134441
        133331
        13-331
        132231
        .1111.
      `,
    },
    tucked: {
      at: [16, 6],
      grid: `
        .111.
        13441
        1-331
        13221
        .111.
      `,
    },
    legs: {
      at: [3, 10],
      grid: `
        111..........111...
        1331........1331...
        1221........1221...
        .11..........11....
      `,
    },
    legsA: {
      at: [3, 10],
      grid: `
        .111..........111..
        .1331........1331..
        .1221........1221..
        ..11..........11...
      `,
    },
    tail: {
      at: [1, 8],
      grid: `
        .1
        11
      `,
    },
    shellDown: {
      at: [3, 4],
      grid: `
        .....<<<<<<.....
        ...<<]]]]]]<<...
        ..<]]]]]]]>]]<..
        .<]]]]]]]]>]>]<.
        .<]]][[[[[>[>]<.
        <]][[[[[[[>[>><.
        <[[[[[[[[[>[>><.
        <>>>>>>>>>>>>><.
        <<<<<<<<<<<<<<<.
      `,
    },
    flipped: {
      at: [3, 5],
      grid: `
        <<<<<<<<<<<<<<<.
        <>>>>>>>>>>>>><.
        <[[[[[[[[[[[[[<.
        .<]]]]]]]]]]]<..
        ..<<]]]]]]]<<...
        ....<<<<<<<.....
        .1..1....1..1...
        .1..1....1..1...
      `,
    },
    dust: {
      at: [0, 2],
      grid: `
        .~..................~...
        ........................
        ...~...........~........
        ........................
        ..........~.............
        ~......................~
      `,
    },
  },
  frames: {
    idle0: ["tail", "legs", "shell", "head"],
    idle1: ["tail", "legs", "shell", ["head", -1, 0]],
    idle2: ["tail", "legs", "shell", "tucked"],
    walk0: ["tail", "legs", "shell", "head"],
    walk1: [["tail", 0, -1], "legsA", ["shell", 0, -1], ["head", 0, -1]],
    walk2: ["tail", "legsA", "shell", "head"],
    walk3: [["tail", 0, -1], "legs", ["shell", 0, -1], ["head", 0, -1]],
    hit: ["shellDown"],
    die0: [["shellDown", 0, -2]],
    die1: ["flipped"],
    die2: ["flipped", "dust"],
  },
  anim: {
    idle: {
      frames: ["idle0", "idle0", "idle0", "idle1", "idle2", "idle2", "idle1", "idle0"],
      fps: 3,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 4 },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 6, loop: false, jump: 1 },
  },
});
