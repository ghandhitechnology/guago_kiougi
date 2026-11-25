import { sprite } from "../../format.ts";

/**
 * 엔트로피, the campus calico. Dry, unimpressed, always right. Sits like a loaf of bread that has
 * seen this exact disaster before: the tail flicks, the eyes close slowly, and once in a while
 * the head turns away from whatever the player is doing.
 */
export default sprite({
  name: "entropy",
  size: [16, 16],
  palette: {
    ".": null,
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    e: "ink.deep",
    z: "ink.dark",
    i: "ink.mid",
    T: "clay.deep",
    u: "clay.mid",
    U: "clay.light",
    a: "gold.mid",
    A: "gold.light",
    F: "rose.light",
    "-": "ink.deep",
  },
  lone: "aA-F",
  parts: {
    // Facing the camera ------------------------------------------------------------------------
    face: {
      at: [2, 1],
      grid: `
        ..e....T....
        .eze..TuT...
        .ezzeeTuUT..
        ezzzzwwuuUG.
        GzzzwwwwwwqG
        GzzwwwwwwwqG
        GzzzwwwzzzqG
        GzAawwwAawqG
        .GwwwFFwwqG.
        ..GGwwwwGG..
      `,
    },
    shut: {
      at: [2, 1],
      grid: `
        ..e....T....
        .eze..TuT...
        .ezzeeTuUT..
        ezzzzwwuuUG.
        GzzzwwwwwwqG
        GzzwwwwwwwqG
        GzzwwwwwwwqG
        GzzzzwwzzzqG
        .GwwwFFwwqG.
        ..GGwwwwGG..
      `,
    },
    away: {
      at: [3, 1],
      grid: `
        ..e....T....
        .eze..TuT...
        .ezzeeTuUT..
        ezzzzwwuuUG.
        GzzzwwwwwwqG
        GzzwwwwwwwqG
        GzzwwzzwwzzG
        GzzwwAawwAaG
        .GwwwwwFFwG.
        ..GGwwwwqG..
      `,
    },
    seated: {
      at: [3, 10],
      grid: `
        .GpwwuuqG..
        GpwwwuUUqG.
        GpwwwuUwqqG
        GwwGwwGwqqG
        GGGGGGGGGGG
      `,
    },
    // One front paw up off the ground for the bat: the chest where it was, the paw lifted, then
    // swatted out to the side.
    seatedPaw: {
      at: [3, 10],
      grid: `
        .GpwwuuqG..
        GpwwwuUUqG.
        GpwwwuUwqqG
        GppGwwGwqqG
        GGGGGGGGGGG
      `,
    },
    pawLift: {
      at: [2, 9],
      grid: `
        .GG.
        GwwG
        GwwG
        .GG.
      `,
    },
    pawOut: {
      at: [0, 10],
      grid: `
        .GGG.
        GwwwG
        .GGG.
      `,
    },
    tail: {
      at: [12, 10],
      grid: `
        ....
        .ee.
        Gzze
        GzeG
        GzeG
        .eG.
      `,
    },
    flick: {
      at: [12, 9],
      grid: `
        ..ee
        .eze
        Gze.
        GzeG
        GzeG
        GzeG
        .eG.
      `,
    },
    // Walking toward the camera ---------------------------------------------------------------
    chest: {
      at: [4, 10],
      grid: `
        GpwwwwqG
        GwwwwwqG
      `,
    },
    pawsA: {
      at: [4, 12],
      grid: `
        GwGGGGGG
        GwG..GGG
        GGG.....
      `,
    },
    pawsB: {
      at: [4, 12],
      grid: `
        GwGGGGqG
        GGG..GqG
        .....GGG
      `,
    },
    pawsC: {
      at: [4, 12],
      grid: `
        GwGGGGqG
        GwG..GqG
        GGG..GGG
      `,
    },
    // Walking away ----------------------------------------------------------------------------
    back: {
      at: [2, 1],
      grid: `
        ..e....T....
        .eze..TuT...
        .ezzeeTuUT..
        ezzzzwwuuUG.
        GzzzwwwwwwqG
        GzzwwwwwwwqG
        GzzwwwwwwqqG
        .GwwwwwwqqG.
        ..GGGGGGGG..
      `,
    },
    rump: {
      at: [3, 9],
      grid: `
        .GwuuuwwqG.
        GwuUUuwwqqG
        GwwuuwwwqqG
        .GGGGGGGGG.
      `,
    },
    upTail: {
      at: [7, 4],
      grid: `
        .ee.
        eze.
        eze.
        .eze
        ..ee
      `,
    },
    hindA: {
      at: [4, 12],
      grid: `
        GwGGGGqG
        GwG..GGG
        GGG.....
      `,
    },
    hindB: {
      at: [4, 12],
      grid: `
        GwGGGGqG
        GGG..GqG
        .....GGG
      `,
    },
    // Walking right ---------------------------------------------------------------------------
    profile: {
      at: [5, 3],
      grid: `
        ...e....T..
        ..eze..TuT.
        ..ezeGGTuuG
        .GzzwwwwwwG
        GzzwwwwzzAG
        GwwwwwwwwFG
        .GwwwwwwwG.
        ..GGGGGGG..
      `,
    },
    trunk: {
      at: [1, 8],
      grid: `
        ..GzzzzwwwwG..
        .GzzzzwwwwwqG.
        .GuuzwwwwwwqG.
        .GuuwwwwwwqqG.
        ..GGGGGGGGGG..
      `,
    },
    sideTail: {
      at: [0, 3],
      grid: `
        .ee.
        ezze
        ezze
        .eze
        ..ee
        ...e
      `,
    },
    sideTailUp: {
      at: [0, 2],
      grid: `
        ..ee
        .eze
        ezze
        eze.
        .eze
        ..ee
      `,
    },
    // The spine stretches on the long stride; the rump goes back a pixel.
    trunkLong: {
      at: [0, 8],
      grid: `
        ..GzzzzzwwwwG..
        .GzzzzwwwwwwqG.
        .GuuzwwwwwwwqG.
        .GuuwwwwwwwqqG.
        ..GGGGGGGGGGG..
      `,
    },
    // The tail droops behind while the body is still on its way up.
    tailDown: {
      at: [0, 4],
      grid: `
        ...ee
        ..eze
        .eze.
        .eze.
        eze..
        ee...
      `,
    },
    legs0: {
      at: [2, 12],
      grid: `
        GwG.......GwG
        .GwG.....GwG.
        ..GG.....GG..
      `,
    },
    legs1: {
      at: [2, 12],
      grid: `
        .GwG.....GwG.
        .GwG.....GwG.
        .GGG.....GGG.
      `,
    },
    legs2: {
      at: [2, 12],
      grid: `
        ..GwG...GwG..
        ..GwG...GwG..
        ..GGG...GGG..
      `,
    },
    legs3: {
      at: [2, 12],
      grid: `
        .GwG.....GwG.
        GwG.......GwG
        GG.........GG
      `,
    },
    // Asleep ----------------------------------------------------------------------------------
    loaf: `
      ................
      ................
      ................
      ................
      ................
      ..e.......T.....
      .eze.....TuT....
      .ezzeGGGGTuUT...
      ezzzzwwwwwuuUGee
      GzzzzwwwwwwwqGze
      GzzzzzwwwzzzqGze
      GzzwwwFFwwwwqGze
      .GGwwwwwwUuuuqGe
      .GpwwwwwUUuuqqG.
      .GpppwwwwqqqqqG.
      ..GGGGGGGGGGGG..
    `,
    breathe: `
      ................
      ................
      ................
      ................
      ................
      ................
      ..e.......T.....
      .eze.....TuT....
      ezzeGGGGGTuUTGee
      ezzzzwwwwwuuUGze
      GzzzzzwwwzzzqGze
      GzzwwwFFwwwwqGze
      .GGwwwwwwUuuuqGe
      .GpwwwwwUUuuqqG.
      .GpppwwwwqqqqqG.
      ..GGGGGGGGGGGG..
    `,
  },
  frames: {
    sit0: ["seated", "tail", "face"],
    sit1: ["seated", "flick", "face"],
    blink: ["seated", "tail", "shut"],
    look: ["seated", "tail", "away"],
    paw0: ["seatedPaw", "tail", "face", "pawLift"],
    paw1: ["seatedPaw", "flick", "face", "pawOut"],
    sleep0: ["loaf"],
    sleep1: ["breathe"],
    down0: ["chest", "pawsA", ["face", 0, 1]],
    down1: [
      ["chest", 0, -1],
      ["pawsC", 0, -1],
      ["face", 0, -1],
    ],
    down2: ["chest", "pawsB", ["face", 0, 1]],
    down3: [
      ["chest", 0, -1],
      ["pawsC", 0, -1],
      ["face", 0, -1],
    ],
    up0: [["upTail", 1, -1], "rump", "hindA", "back"],
    up1: ["upTail", ["rump", 0, -1], ["pawsC", 0, -1], ["back", 0, -1]],
    up2: [["upTail", 1, -1], "rump", "hindB", "back"],
    up3: [
      ["upTail", 2, 0],
      ["rump", 0, -1],
      ["pawsC", 0, -1],
      ["back", 0, -1],
    ],
    side0: ["tailDown", "trunkLong", "legs3", "profile"],
    side1: ["sideTail", ["trunk", 0, -1], "legs2", ["profile", 0, -1]],
    side2: [["sideTailUp", 0, -1], "trunk", "legs0", "profile"],
    side3: ["sideTailUp", ["trunk", 0, -1], "legs1", ["profile", 0, -1]],
  },
  anim: {
    idle: {
      frames: [
        "sit0",
        "sit0",
        "sit0",
        "sit1",
        "sit0",
        "sit0",
        "sit0",
        "blink",
        "blink",
        "blink",
        "sit0",
        "sit0",
        "look",
        "look",
        "look",
        "sit0",
      ],
      fps: 4,
    },
    sleep: { frames: ["sleep0", "sleep0", "sleep1", "sleep1"], fps: 2 },
    /** Batting at something, unhurried, then looking away as if it never happened. */
    paw: {
      frames: [
        "sit0",
        "paw0",
        "paw0",
        "paw0",
        "paw1",
        "paw0",
        "sit0",
        "look",
        "look",
        "look",
        "blink",
        "sit0",
      ],
      fps: 4,
      loop: false,
    },
    walkDown: { frames: ["down0", "down1", "down2", "down3"], fps: 8 },
    walkUp: { frames: ["up0", "up1", "up2", "up3"], fps: 8 },
    walkSide: { frames: ["side0", "side1", "side2", "side3"], fps: 8 },
  },
});
