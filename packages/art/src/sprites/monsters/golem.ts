import { sprite } from "../../format.ts";

/**
 * 오답노트 골렘: the tutorial mini-boss, stacked together from a student's notebook of wrong
 * answers. Earnest and stubborn: between steps it re-reads its own red-pen marks, squints, and
 * keeps the wrong answer anyway. Eraser fists, a pencil stuck in its head.
 *
 * Parts move on their own: head, body, both arms and the feet. The slam telegraphs with both
 * fists held overhead and the eyes lit, smears down, and lands with a shock ring.
 */
export default sprite({
  name: "golem",
  size: [32, 32],
  palette: {
    ".": null,
    "6": "olive.deep",
    "7": "olive.dark",
    "8": "olive.mid",
    "9": "olive.light",
    G: "stone.deep",
    g: "stone.mid",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    R: "red.deep",
    r: "red.dark",
    m: "red.mid",
    M: "red.light",
    P: "red.pale",
    "&": "rose.deep",
    "*": "rose.dark",
    f: "rose.mid",
    F: "rose.light",
    W: "wood.deep",
    D: "gold.dark",
    a: "gold.mid",
    A: "gold.light",
    e: "ink.deep",
    "^": "stone.bright",
    "~": "stone.pale",
    "!": "red.light",
    o: "stone.light",
  },
  lone: "^~!o",
  parts: {
    pencil: {
      at: [18, 0],
      grid: `
        .ee.
        WaAW
        WaAW
        WaAW
        WWWW
      `,
    },
    head: {
      at: [9, 3],
      grid: `
        .666666666666.
        69998888888876
        69888888888876
        698mm8888mm876
        69m88m88m88m76
        698mm8888mm876
        69888888888876
        69888mmmm88876
        67777777777776
        .666666666666.
      `,
    },
    squint: {
      at: [9, 3],
      grid: `
        .666666666666.
        69998888888876
        69888888888876
        69888888888876
        69mmmm88mmmm76
        69888888888876
        69888888888876
        6988888mmmm876
        67777777777776
        .666666666666.
      `,
    },
    glare: {
      at: [9, 3],
      grid: `
        .666666666666.
        69998888888876
        69888888888876
        698mm8888mm876
        69mMMm88mMMm76
        698mm8888mm876
        69888888888876
        6988mmmmmm8876
        67777777777776
        .666666666666.
      `,
    },
    body: {
      at: [8, 12],
      grid: `
        GG66666666666666
        Go99988888888876
        GG98888888888876
        Go98pppppppp8876
        GG98pmmpmmmp8876
        Go98pppppppp8876
        GG98888888888876
        Go988mm888mm8876
        GG9888mmmm888876
        Go98888mm8888876
        GG9888mmmm888876
        Go988mm888mm8876
        GG98888888888776
        Go88888888887776
        GG77777777777776
        GG66666666666666
      `,
    },
    flap: {
      at: [12, 15],
      grid: `
        ......wwp
        ppppwwpp.
        ppppwwpp.
        ppppppp..
      `,
    },
    armL: {
      at: [3, 13],
      grid: `
        .666.
        69876
        69876
        69876
        69876
        69876
        69876
        .666.
      `,
    },
    armR: {
      at: [24, 13],
      grid: `
        .666.
        69876
        69876
        69876
        69876
        69876
        69876
        .666.
      `,
    },
    fistL: {
      at: [2, 20],
      grid: `
        .&&&&.
        &FFff&
        &Ffff&
        &wwwq&
        &pppq&
        .&&&&.
      `,
    },
    fistR: {
      at: [24, 20],
      grid: `
        .&&&&.
        &FFff&
        &Ffff&
        &wwwq&
        &pppq&
        .&&&&.
      `,
    },
    feet: {
      at: [8, 27],
      grid: `
        6666666..6666666
        6998886..6998886
        6888886..6888886
        6666666..6666666
      `,
    },
    stepL: {
      at: [8, 26],
      grid: `
        6666666.........
        6998886..6666666
        6888886..6998886
        6666666..6666666
      `,
    },
    stepR: {
      at: [8, 26],
      grid: `
        .........6666666
        6666666..6998886
        6998886..6888886
        6666666..6666666
      `,
    },
    // Slam: arms overhead, a smear on the way down, fists on the ground.
    upL: {
      at: [4, 1],
      grid: `
        .&&&&.
        &FFff&
        &Ffff&
        &wwwq&
        &pppq&
        .&&&&.
        .666..
        69876.
        69876.
        69876.
        69876.
        69876.
        .666..
      `,
    },
    upR: {
      at: [22, 1],
      grid: `
        .&&&&.
        &FFff&
        &Ffff&
        &wwwq&
        &pppq&
        .&&&&.
        ..666.
        .69876
        .69876
        .69876
        .69876
        .69876
        ..666.
      `,
    },
    smearL: {
      at: [1, 6],
      grid: `
        ..~...
        .~....
        .~....
        ~.....
        ~.....
        .&&&&.
        &FFff&
        &Ffff&
        &Ffff&
        &wwwq&
        &wwwq&
        &pppq&
        &pppq&
        .&&&&.
      `,
    },
    smearR: {
      at: [25, 6],
      grid: `
        ...~..
        ....~.
        ....~.
        .....~
        .....~
        .&&&&.
        &FFff&
        &Ffff&
        &Ffff&
        &wwwq&
        &wwwq&
        &pppq&
        &pppq&
        .&&&&.
      `,
    },
    slamFists: {
      at: [3, 22],
      grid: `
        .&&&&&&&..........&&&&&&&.
        &FFFffff&........&FFFffff&
        &Fffffff&........&Fffffff&
        &wwwwwwq&........&wwwwwwq&
        &ppppppq&........&ppppppq&
        .&&&&&&&..........&&&&&&&.
      `,
    },
    shock: {
      at: [0, 24],
      grid: `
        ^..............................^
        .^............................^.
        ...^........................^...
        ......~..................~......
      `,
    },
    // Hit and death.
    pages: {
      at: [0, 2],
      grid: `
        ..~.........................^...
        .~~........................~~...
        ................................
        ....^..........................~
      `,
    },
    cracked: {
      at: [8, 12],
      grid: `
        GG66666666666666
        Go99988888888876
        GG98888888888876
        Go98pppppppp8876
        GG98pmmpmmmp8876
        Go98pppppppp8876
        GG98888888888876
        Go98ee88888ee876
        GG988ee888ee8876
        Go98888ee888e876
        GG98888ee8888876
        Go98888e888ee876
        GG98ee888888e776
        Go88888888887776
        GG77777777777776
        GG66666666666666
      `,
    },
    heap: {
      at: [3, 20],
      grid: `
        ..........WWWWWW..........
        ..........WaaAAW..........
        ..6666666.WWWWWW&&&&&.....
        .699888876.....&FFff&.....
        .688888876..66666666666...
        ..6666666..69988888888866.
        ..6666666666666666666666..
        .6999888888888888888887766
        .6777777777777777777777776
        ..666666666666666666666666
      `,
    },
    scraps: {
      at: [0, 14],
      grid: `
        ..........~.........^..........
        ...~...........................
        ................~.......~......
        ......^........................
        ..............................~
        ...........^...........~.......
      `,
    },
  },
  frames: {
    idle0: ["pencil", "armL", "armR", "fistL", "fistR", "feet", "body", "head"],
    idle1: [
      ["pencil", 0, 1],
      ["armL", 0, 1],
      ["armR", 0, 1],
      "fistL",
      "fistR",
      "feet",
      ["body", 0, 1],
      ["head", 0, 1],
    ],
    idle2: [
      ["pencil", 1, 1],
      ["armL", 0, 1],
      ["armR", 0, 1],
      "fistL",
      "fistR",
      "feet",
      ["body", 0, 1],
      "flap",
      ["squint", 1, 1],
    ],
    idle3: ["pencil", "armL", "armR", "fistL", "fistR", "feet", "body", "flap", "squint"],
    walk0: [
      ["pencil", -1, 0],
      ["armL", -1, 0],
      ["armR", -1, 0],
      ["fistL", -1, 1],
      ["fistR", -1, -1],
      "stepL",
      ["body", -1, 0],
      ["head", -1, 0],
    ],
    walk1: [
      ["pencil", 0, 1],
      ["armL", 0, 1],
      ["armR", 0, 1],
      "fistL",
      "fistR",
      "feet",
      ["body", 0, 1],
      ["head", 0, 1],
    ],
    walk2: [
      ["pencil", 1, 0],
      ["armL", 1, 0],
      ["armR", 1, 0],
      ["fistL", 1, -1],
      ["fistR", 1, 1],
      "stepR",
      ["body", 1, 0],
      ["head", 1, 0],
    ],
    walk3: [
      ["pencil", 0, 1],
      ["armL", 0, 1],
      ["armR", 0, 1],
      "fistL",
      "fistR",
      "feet",
      ["body", 0, 1],
      ["head", 0, 1],
    ],
    slam0: [
      ["pencil", 0, 1],
      ["armL", 0, -3],
      ["armR", 0, -3],
      ["fistL", 0, -6],
      ["fistR", 0, -6],
      "feet",
      ["body", 0, 1],
      ["glare", 0, 1],
    ],
    slam1: ["pencil", "upL", "upR", "feet", ["body", 0, -1], "glare"],
    slam2: [["pencil", 0, 1], "feet", ["body", 0, 1], "smearL", "smearR", ["glare", 0, 2]],
    slam3: [
      ["pencil", 0, 3],
      ["armL", 0, 4],
      ["armR", 0, 4],
      "feet",
      ["body", 0, 3],
      ["head", 0, 4],
      "slamFists",
      "shock",
    ],
    slam4: [
      ["pencil", 0, 2],
      ["armL", 0, 2],
      ["armR", 0, 2],
      ["fistL", 0, 2],
      ["fistR", 0, 2],
      "feet",
      ["body", 0, 2],
      ["squint", 0, 2],
    ],
    hit: [
      ["pencil", 2, 0],
      ["armL", 1, -1],
      ["armR", 1, -1],
      ["fistL", 1, -2],
      ["fistR", 1, -2],
      "feet",
      ["body", 1, -1],
      ["squint", 2, 0],
      "pages",
    ],
    die0: ["pencil", "armL", "armR", "fistL", "fistR", "feet", "cracked", "squint"],
    die1: [
      ["pencil", 3, 4],
      ["armL", -2, 6],
      ["armR", 2, 6],
      ["fistL", -1, 5],
      ["fistR", 1, 5],
      "feet",
      ["cracked", 0, 4],
      ["squint", 0, 7],
      "scraps",
    ],
    die2: ["heap"],
  },
  anim: {
    idle: {
      frames: ["idle0", "idle1", "idle0", "idle1", "idle2", "idle3", "idle3", "idle0"],
      fps: 4,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    slam: {
      frames: ["slam0", "slam1", "slam1", "slam1", "slam2", "slam3", "slam3", "slam4"],
      fps: 10,
      loop: false,
    },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 6, loop: false, jump: 1 },
  },
});
