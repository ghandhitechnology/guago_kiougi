import { sprite } from "../../format.ts";

/**
 * 오답노트 골렘: the tutorial mini-boss, a spiral notebook of wrong answers that stood up. Ruled
 * cream pages covered in red-pen X marks, a dog-eared corner, a torn bottom edge, the spiral
 * down its left side. Earnest and stubborn: between steps it lifts a page to re-read its own
 * marks, squints, and keeps the wrong answer anyway. Hunched, with one heavy rolled-up arm that
 * drags and one thin one, eraser fists, and a pencil stuck in its crumpled head.
 *
 * Parts move on their own: head, body, both arms, the feet and the loose sheets. The slam
 * telegraphs with both fists held overhead and the eyes lit, smears down, and lands with a
 * shock ring.
 */
export default sprite({
  name: "golem",
  size: [32, 32],
  palette: {
    ".": null,
    S: "stone.deep",
    s: "stone.dark",
    C: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    b: "navy.pale",
    r: "red.mid",
    M: "red.light",
    "&": "rose.deep",
    f: "rose.mid",
    F: "rose.light",
    W: "wood.deep",
    a: "gold.mid",
    A: "gold.light",
    c: "stone.mid",
    e: "ink.deep",
    // Lone marks: the wire glint on each coil, eye glints, flying scraps.
    o: "ink.light",
    "^": "stone.bright",
    "~": "stone.pale",
    "!": "red.light",
  },
  lone: "o^~!",
  parts: {
    pencil: {
      at: [16, 5],
      grid: `
        .&&.
        &FF&
        WccW
        WaAW
        WaAW
        WaAW
      `,
    },
    head: {
      at: [10, 11],
      grid: `
        .SSSS..SSSS.
        SwwwwSSpppCS
        SwrrpppprrCS
        Sp^eppp^epCS
        SpeepppeepCS
        SppppepeppCS
        SpppepepeCCS
        SCCCCCCCCCCS
        .SSSSSSSSSS.
      `,
    },
    squint: {
      at: [10, 11],
      grid: `
        .SSSS..SSSS.
        SwwwwSSpppCS
        SwppppppppCS
        SprrppprrpCS
        SpeeeppeeeCS
        SppppppppCCS
        SpppeeeepCCS
        SCCCCCCCCCCS
        .SSSSSSSSSS.
      `,
    },
    glare: {
      at: [10, 11],
      grid: `
        .SSSS..SSSS.
        SwwwwSSpppCS
        SwrrpppprrCS
        SpMMpppMMpCS
        SpMMpppMMpCS
        SppeeeeeppCS
        SppeMMMeeCCS
        SCCCCCCCCCCS
        .SSSSSSSSSS.
      `,
    },
    body: {
      at: [6, 5],
      grid: `
        .....SSSSSSSS.......
        ...SSwwwwwwwwSSSS...
        ..SwwwwwwwwwwwpsCS..
        .SSwwMpppppppppsCCS.
        SoSwpMppppppppppsssS
        .SSwpMbbbbbbbbbbbbCS
        ..SwpMppppppppppppCS
        .SSwpMbbbbbbbbbbbbCS
        SoSwpMppppppppppppCS
        .SSwpMbbbbbbbbbbbbCS
        ..SwpMppppppppppppCS
        .SSwpMbbbbbbbbbbbbCS
        SoSwpMppppppppppppCS
        .SSwpMbbbbbbbbbbbbCS
        ..SwpMppppppppppppCS
        .SSwpMbbrbbbbrbbbbCS
        SoSwpMppprpprpppppCS
        .SSwpMbbbbrrbbbbbbCS
        ..SwpMppprpprpppppCS
        ..SwpMbbrbbbbrbbbbCS
        ..SCCCSSCCCCSSCCCSSS
        ...SSS..SSSS..SSS...
      `,
    },
    // A page lifted to re-read the marks on it.
    flap: {
      at: [17, 18],
      grid: `
        .......S
        ......SS
        .....SpS
        ....SppS
        ...SpppS
        ..SppCCS
        SSSSSSSS
      `,
    },
    // Loose sheets stuck in the back: they lie flat at rest and lift on every step.
    sheet: {
      at: [21, 2],
      grid: `
        .SSSS
        SpppS
        SbbbS
        SpppS
        SSSSS
      `,
    },
    sheetUp: {
      at: [22, 0],
      grid: `
        ..SS..
        .SwwS.
        SwppbS
        SpbbCS
        .SpCS.
        ..SS..
      `,
    },
    armL: {
      at: [1, 8],
      grid: `
        .SSSS.
        SwppCS
        SwppCS
        SbbbbS
        SwppCS
        SwppCS
        SwppCS
        SbbbbS
        SwppCS
        SwppCS
        SwppCS
        SbbbbS
        SwppCS
        SwppCS
        SwppCS
        .SSSS.
      `,
    },
    armR: {
      at: [25, 9],
      grid: `
        .SS.
        SwCS
        SwCS
        SbbS
        SwCS
        SwCS
        SwCS
        SwCS
        SwCS
        .SS.
      `,
    },
    fistL: {
      at: [0, 23],
      grid: `
        .&&&&&.
        &FFfff&
        &Fffff&
        &wwwwC&
        &ppppC&
        .&&&&&.
      `,
    },
    fistR: {
      at: [25, 18],
      grid: `
        .&&&&.
        &FFff&
        &Ffff&
        &wwwC&
        &pppC&
        .&&&&.
      `,
    },
    feet: {
      at: [8, 27],
      grid: `
        SSSSSSS..SSSSSSS
        SwwppCS..SwwppCS
        SCCCCCS..SCCCCCS
        SSSSSSS..SSSSSSS
      `,
    },
    stepL: {
      at: [8, 26],
      grid: `
        SSSSSSS.........
        SwwppCS..SSSSSSS
        SCCCCCS..SwwppCS
        SSSSSSS..SCCCCCS
        .........SSSSSSS
      `,
    },
    stepR: {
      at: [8, 26],
      grid: `
        .........SSSSSSS
        SSSSSSS..SwwppCS
        SwwppCS..SCCCCCS
        SCCCCCS..SSSSSSS
        SSSSSSS.........
      `,
    },
    // Slam: arms overhead, a smear on the way down, fists on the ground.
    upL: {
      at: [0, 0],
      grid: `
        .&&&&&.
        &FFfff&
        &Fffff&
        &wwwwC&
        &ppppC&
        .&&&&&.
        ..SSSS.
        .SwppCS
        .SwppCS
        .SbbbbS
        .SwppCS
        .SwppCS
        ..SSSS.
      `,
    },
    upR: {
      at: [24, 3],
      grid: `
        .&&&&.
        &FFff&
        &Ffff&
        &wwwC&
        &pppC&
        .&&&&.
        ..SS..
        .SwCS.
        .SwCS.
        .SbbS.
        .SwCS.
        .SwCS.
        ..SS..
      `,
    },
    smearL: {
      at: [0, 9],
      grid: `
        ..~....
        .~.....
        .~.....
        ~......
        .&&&&&.
        &FFfff&
        &Fffff&
        &Fffff&
        &wwwwC&
        &wwwwC&
        &ppppC&
        &ppppC&
        .&&&&&.
      `,
    },
    smearR: {
      at: [25, 6],
      grid: `
        ...~..
        ....~.
        ....~.
        .....~
        .&&&&.
        &FFff&
        &Ffff&
        &Ffff&
        &wwwC&
        &wwwC&
        &pppC&
        &pppC&
        .&&&&.
      `,
    },
    slamFists: {
      at: [0, 23],
      grid: `
        .&&&&&&&&..................&&&&&.
        &FFFfffff&................&FFff&.
        &Ffffffff&................&Ffff&.
        &wwwwwwwC&................&wwwC&.
        &pppppppC&................&pppC&.
        .&&&&&&&&..................&&&&..
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
        ..~..........................^..
        .~~...........................~~
        ................................
        ....^..........................~
      `,
    },
    torn: {
      at: [10, 11],
      grid: `
        .SSSS..SSSS.
        SwwwwSSpppCS
        SwpppSppppCS
        SprrppSrrpCS
        SpeeeSpeeeCS
        SpppppSppCCS
        SpppeeeSpCCS
        SCCCCCSCCCCS
        .SSSSSSSSSS.
      `,
    },
    heap: {
      at: [2, 21],
      grid: `
        ............&&............
        ...SSSS....&FF&...&&&&....
        ..SwppCS...WccW..&FFff&...
        .SwpbbCSSSSWaAWS.&ffff&...
        SwwppprrpppWaAWS.&wwCC&...
        SwpbbbbbbbbWWWWpS&&&&SSSS.
        SwpppppppprrpppppppppppCCS
        SCCCCCCCCCCCCCCCCCCCCCCCCS
        .SSSSSSSSSSSSSSSSSSSSSSSS.
      `,
    },
    scraps: {
      at: [0, 14],
      grid: `
        ..........~.........^..........
        ...~...........................
        ........................~......
        ......^........................
        ..............................~
        ...........^...........~.......
      `,
    },
  },
  frames: {
    idle0: ["sheet", "armL", "armR", "fistL", "fistR", "feet", "body", "pencil", "head"],
    idle1: [
      ["sheet", 0, 1],
      ["armL", 0, 1],
      ["armR", 0, 1],
      "fistL",
      "fistR",
      "feet",
      ["body", 0, 1],
      ["pencil", 0, 1],
      ["head", 0, 1],
    ],
    idle2: [
      ["sheet", 0, 1],
      ["armL", 0, 1],
      ["armR", 0, 1],
      "fistL",
      "fistR",
      "feet",
      ["body", 0, 1],
      ["flap", 0, 1],
      ["pencil", 0, 1],
      ["squint", 0, 1],
    ],
    idle3: ["sheet", "armL", "armR", "fistL", "fistR", "feet", "body", "flap", "pencil", "squint"],
    walk0: [
      ["sheetUp", -1, 0],
      ["armL", -1, 0],
      ["armR", -1, 0],
      ["fistL", 0, 1],
      ["fistR", -1, -1],
      "stepL",
      ["body", -1, 0],
      ["pencil", -1, 0],
      ["head", -1, 0],
    ],
    walk1: [
      ["sheet", 0, 1],
      ["armL", 0, 1],
      ["armR", 0, 1],
      "fistL",
      "fistR",
      "feet",
      ["body", 0, 1],
      ["pencil", 0, 1],
      ["head", 0, 1],
    ],
    walk2: [
      ["sheetUp", 1, 0],
      ["armL", 1, 0],
      ["armR", 1, 0],
      ["fistL", 1, -1],
      ["fistR", 1, 1],
      "stepR",
      ["body", 1, 0],
      ["pencil", 1, 0],
      ["head", 1, 0],
    ],
    walk3: [
      ["sheet", 0, 1],
      ["armL", 0, 1],
      ["armR", 0, 1],
      "fistL",
      "fistR",
      "feet",
      ["body", 0, 1],
      ["pencil", 0, 1],
      ["head", 0, 1],
    ],
    slam0: [
      ["sheetUp", 0, 1],
      ["armL", 0, -3],
      ["armR", 0, -3],
      ["fistL", 0, -6],
      ["fistR", 0, -6],
      "feet",
      ["body", 0, 1],
      ["pencil", 0, 1],
      ["glare", 0, 1],
    ],
    slam1: [["sheet", 0, -1], "upL", "upR", "feet", ["body", 0, -1], "pencil", "glare"],
    slam2: ["sheet", "feet", ["body", 0, 1], "smearL", "smearR", ["pencil", 0, 2], ["glare", 0, 2]],
    slam3: [
      ["sheetUp", 0, 3],
      ["armL", 0, 4],
      ["armR", 0, 4],
      "feet",
      ["body", 0, 3],
      ["pencil", 0, 4],
      ["head", 0, 4],
      "slamFists",
      "shock",
    ],
    slam4: [
      ["sheet", 0, 1],
      ["armL", 0, 1],
      ["armR", 0, 1],
      ["fistL", 0, 1],
      ["fistR", 0, 1],
      "feet",
      ["body", 0, 1],
      ["pencil", 0, 1],
      ["squint", 0, 1],
    ],
    hit: [
      ["sheetUp", 2, 0],
      ["armL", 1, -1],
      ["armR", 1, -1],
      ["fistL", 1, -2],
      ["fistR", 1, -2],
      "feet",
      ["body", 1, -1],
      ["pencil", 1, -1],
      ["squint", 1, -1],
      "pages",
    ],
    die0: ["sheetUp", "armL", "armR", "fistL", "fistR", "feet", "body", "flap", "pencil", "torn"],
    die1: [
      ["armL", -1, 6],
      ["armR", 2, 6],
      ["fistL", 0, 2],
      ["fistR", 1, 5],
      "feet",
      ["body", 0, 4],
      ["pencil", 0, 7],
      ["torn", 0, 7],
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
