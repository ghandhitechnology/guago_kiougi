import { swapPart } from "../../figure.ts";
import { bake } from "../../folk.ts";
import { type Dir, type Legend, part, rig, sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { frame, garment, ink, lone, shadow, skin, walkArms } from "./student.ts";

/**
 * 아테네 경비병, who patrols the 그림자 동굴 in Page 1 and reports students to 권 사감 by letter.
 * Stiff, by the book, suspicious of every face not on his list, and its threat and its comedy:
 * a bronze crested helmet, a black beard, a red cloak over a white tunic, bronze greaves and the
 * torch he walks the passages with. `idle` glances left and right; `walk` carries the torch out
 * in front, so it turns with his route; `alert` is the start when he sees someone, torch up;
 * `catch` is the lunge that puts them out of the cave; `halt` is the palm up at the mouth.
 * `guard-cone` is the cone of what he can see, drawn in front of him per direction.
 */
const palette: Legend = { ...ink, B: "wood.mid" };
/** Bronze: dark ochre with brass glints, apart from the terracotta of the dust and torchlight. */
const BRONZE: Legend = {
  T: "gold.deep",
  t: "gold.deep",
  u: "gold.dark",
  U: "gold.mid",
  y: "gold.light",
};

const helmet = part({
  palette: { ...palette, ...BRONZE },
  pieces: {
    head: {
      at: { down: [4, 1], up: [4, 1], side: [0, 1] },
      down: `
        ......RRRR......
        ....TTRMmRTT....
        ..TTUuRMmRuuTT..
        .TUyUuRRRRuutTT.
        .TUyUuuuuuuuttT.
        TUUuuuuuuuuuuttT
        TUuTTTTTTTTTTutT
        TUuT........TutT
        TUuT........TutT
        TUuuT......TuutT
        .TuuT......TutT.
        ..TT........TT..
      `,
      up: `
        ......RRRR......
        ....TTRMmRTT....
        ..TTUuRMmRuuTT..
        .TUyUuRmmRuutTT.
        .TUyUuRmmRuuttT.
        TUUuuuRmmRuuuttT
        TUuuuuRrrRuuutTT
        TUuuuuuuuuuuuttT
        TUuuuuuuuuuuuttT
        .TUuuuuuuuuuttT.
        ..TTuuuuuuuuTT..
        ....TTTTTTTT....
      `,
      side: `
        ....RRRRRR..........
        ...RMmmTTTTTT.......
        ..RMmTTUUuuuuTT.....
        ..RmTUUyuuuuuuTT....
        ..RmTUyuuuuuuuuT....
        ...RTUuuuuuuTTTT....
        ....TUuuuuuT........
        ....TUuuuuT.........
        ....TUuuuuT.........
        ....TUuuuuT.........
        .....TuuT...........
        ......TT............
      `,
    },
  },
});

const stern = part({
  palette,
  lone,
  pieces: {
    head: {
      at: { down: [5, 8], up: [5, 8], side: [3, 8] },
      down: {
        rest: `
          ...e,....,e...
          ...ee....ee...
          ....WWWWWW....
          ....WWWWWW....
        `,
        look: `
          ...,,....,,...
          ...ee....ee...
          ....WWWWWW....
          ....WWWWWW....
        `,
        shout: `
          ...e,....,e...
          ...ee....ee...
          ....WW!!WW....
          ....WW!!WW....
        `,
      },
      up: null,
      side: {
        rest: `
          ...........e,..
          ...........ee..
          ...........WWW.
          ............WW.
        `,
        look: `
          ...........,,..
          ...........ee..
          ...........WWW.
          ............WW.
        `,
        shout: `
          ...........e,..
          ...........ee..
          ...........W!W.
          ............WW.
        `,
      },
    },
  },
});

/** A white tunic belted in leather under the red cloak; bronze greaves and sandals. */
const kit = swapPart(
  garment(
    {
      ...palette,
      ...BRONZE,
      "1": "skin.deep",
      "2": "skin.light",
      "3": "skin.dark",
      "4": "skin.deep",
      "5": "skin.mid",
      "6": "skin.dark",
    },
    {
      down: `
        RmwwwwrR
        RmwwwqrR
        RmwwwqrR
        RmWWWWrR
        RmwwwqrR
        RmwwqqrR
        RRRRRRRR
      `,
      up: `
        RRRRRRRR
        RMmmmmrR
        RMmmmmrR
        RMmmmmrR
        RMmmmmrR
        RmmmmrrR
        RRRRRRRR
      `,
      side: `
        RRwwqR
        RmwwqR
        RmwwqR
        RWWWWR
        RmwqqR
        RmwqqR
        RRRRRR
      `,
    },
    true,
  ),
  "eIizGw",
  "TUutWB",
  ["legL", "legR"],
);

/**
 * The torch he carries through the cave: ash handle, the flame flickering between two shapes.
 * Held out in front whichever way he walks, so the cone the lighting draws from it turns with
 * him; raised high when he sees someone.
 */
const FLAME = [
  `
    ..M.
    .MA.
    .AYa
    aYYa
    .aa.
    ..W.
    ..W.
    ..W.
    ..W.
    ..W.
    ..W.
  `,
  `
    .M..
    .AM.
    aAYa
    aYYa
    .aa.
    ..W.
    ..W.
    ..W.
    ..W.
    ..W.
    ..W.
  `,
];
const torch = part({
  palette: { ...palette, M: "red.light", A: "gold.light", Y: "gold.pale", a: "gold.mid" },
  lone: "M",
  pieces: {
    hand: {
      at: { down: [2, 9], up: [19, 9], side: [18, 7] },
      down: {
        rest: FLAME[0] as string,
        lit: FLAME[1] as string,
        high: { at: [0, 0], grid: FLAME[0] as string },
        reach: { at: [1, 6], grid: FLAME[1] as string },
      },
      up: {
        rest: FLAME[0] as string,
        lit: FLAME[1] as string,
        high: { at: [19, 0], grid: FLAME[0] as string },
        reach: { at: [19, 6], grid: FLAME[1] as string },
      },
      side: {
        rest: FLAME[0] as string,
        lit: FLAME[1] as string,
        high: { at: [17, 1], grid: FLAME[0] as string },
        reach: { at: [20, 4], grid: FLAME[1] as string },
      },
    },
  },
});

/** The start he gives when he sees someone where nobody should be. */
const spotted = part({
  palette: { ...ink, D: "gold.deep", a: "gold.light" },
  pieces: {
    head: {
      at: { down: [17, 0], up: [17, 0], side: [15, 0] },
      down: { rest: ".", alert: ".DD.\nDaaD\nDaaD\n.DD.\n....\n.DD.\n.DD." },
      up: { rest: ".", alert: ".DD.\nDaaD\nDaaD\n.DD.\n....\n.DD.\n.DD." },
      side: { rest: ".", alert: ".DD.\nDaaD\nDaaD\n.DD.\n....\n.DD.\n.DD." },
    },
  },
});

const hold = (d: Dir) => (d === "up" ? {} : d === "side" ? { armR: "fwd" } : {});

const guard = bake(
  rig({
    name: "guard",
    ...frame,
    group: "page1-cast",
    parts: {
      shadow: { blob: shadow },
      body: { base: skin },
      uniform: { kit },
      face: { stern },
      hair: { helmet },
      accessory: { spotted },
      book: { torch },
    },
    frames: {
      idle0: (d: Dir) => hold(d) as never,
      idle1: (d: Dir) => ({ ...hold(d), hand: "lit", torso: [0, -1] }) as never,
      left: (d: Dir) => ({ ...hold(d), head: "look", hand: "lit" }) as never,
      walk0: (d: Dir) => ({ ...walkArms(d, "R"), ...hold(d), hand: "rest" }) as never,
      walk1: (d: Dir) => ({ ...hold(d), torso: [0, -1], hand: ["lit", 0, -1] }) as never,
      walk2: (d: Dir) => ({ ...walkArms(d, "L"), ...hold(d), hand: "rest" }) as never,
      walk3: (d: Dir) => ({ ...hold(d), torso: [0, -1], hand: ["lit", 0, -1] }) as never,
      talk0: (d: Dir) => ({ ...hold(d), head: "shout" }) as never,
      alert0: (d: Dir) =>
        ({ armR: d === "side" ? "mouth" : "raise", hand: "high", head: "alert" }) as never,
      alert1: (d: Dir) =>
        ({
          armR: [d === "side" ? "mouth" : "raise", 0, -1],
          hand: ["high", 0, -1],
          head: "alert",
        }) as never,
      catch0: (d: Dir) =>
        ({
          hand: "reach",
          head: "shout",
          ...(d === "side" ? { armR: "strike", torso: [2, 0] } : { armL: "fling", torso: [0, 1] }),
        }) as never,
      halt0: (d: Dir) => ({ ...hold(d), head: "shout" }) as never,
      halt1: (d: Dir) =>
        ({ head: "shout", ...(d === "side" ? { armR: "fwd" } : { armL: "raise" }) }) as never,
    },
    anim: {
      idle: {
        frames: ["idle0", "idle1", "left", "left", "idle0", "idle1", "idle0", "idle1"],
        fps: 3,
      },
      walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 5 },
      talk: { frames: ["talk0", "idle0", "talk0", "idle1"], fps: 4 },
      alert: { frames: ["alert0", "alert1", "alert0", "alert1", "alert0"], fps: 6, loop: false },
      catch: {
        frames: ["alert0", "catch0", "catch0", "catch0", "catch0", "idle0"],
        fps: 6,
        loop: false,
      },
      halt: { frames: ["halt0", "halt1", "halt1", "halt1", "halt1", "idle0"], fps: 4, loop: false },
    },
    looks: {
      patrol: {
        parts: {
          shadow: "blob",
          body: "base",
          uniform: "kit",
          face: "stern",
          hair: "helmet",
          accessory: "spotted",
          book: "torch",
        },
        slots: { skin: "warm", hair: "black" },
      },
    },
  }),
);

// Vision cone ---------------------------------------------------------------------------------

/**
 * What the guard can see: a wedge from his eyes, 60 degrees wide and 44 pixels long, in three
 * bands that fade from his eyes out. All three directions share one square canvas with its
 * origin at his eyes, so the client places the cone at the guard's eye point and plays the
 * frame for the way he faces (side is flipped for left, like every sprite), drawn faded.
 */
const CONE_LEN = 44;
const CONE = 2 * CONE_LEN + 3;
const EYE = CONE_LEN + 1;
const HALF = Math.tan(Math.PI / 6);

function cone(dir: "down" | "up" | "side"): string {
  const pic = Pic.blank(CONE, CONE);
  for (let y = 0; y < CONE; y++) {
    for (let x = 0; x < CONE; x++) {
      const along = dir === "side" ? x - EYE : dir === "down" ? y - EYE : EYE - y;
      const across = dir === "side" ? Math.abs(y - EYE) : Math.abs(x - EYE);
      if (along < 3 || along > CONE_LEN) continue;
      const reach = along * HALF;
      if (across > reach) continue;
      const rim = across > reach - 1.2 || along > CONE_LEN - 1.2;
      const band = along < CONE_LEN * 0.4 ? "w" : along < CONE_LEN * 0.75 ? "Y" : "y";
      pic.set(x, y, rim ? "a" : band);
    }
  }
  return pic.toString();
}

const guardCone = sprite({
  name: "guard-cone",
  group: "cast",
  size: [CONE, CONE],
  origin: [EYE, EYE],
  palette: { ".": null, a: "gold.light", Y: "gold.pale", y: "stone.pale", w: "stone.bright" },
  outline: false,
  frames: { down: cone("down"), up: cone("up"), side: cone("side") },
  anim: {
    down: { frames: ["down"], fps: 1 },
    up: { frames: ["up"], fps: 1 },
    side: { frames: ["side"], fps: 1 },
  },
});

export default [guard, guardCone];
