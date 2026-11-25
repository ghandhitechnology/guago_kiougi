import { swapPart } from "../../figure.ts";
import { type Legend, part, rig, sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { frame, garment, ink, lone, shadow, skin, walkArms } from "./student.ts";

/**
 * 아테네 경비병, who patrols the 그림자 동굴 in Page 1 and reports students to 권 사감 by letter.
 * Stiff, by the book, suspicious of every face not on his list: a bronze crested helmet, a
 * black beard, a red cloak over a white tunic, bronze greaves and a spear. He glances left and
 * right; his signature is the halt, spear planted and a palm up. `guard-cone` is the cone of
 * what he can see, drawn in front of him per direction.
 */
const palette: Legend = { ...ink, B: "wood.mid" };

const helmet = part({
  palette,
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

/** The spear: a bronze leaf blade on a long ash shaft. */
const SPEAR =
  ".T.\nTUT\nTUT\nTuT\nTuT\n.T.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.\n.W.";
const spear = part({
  palette,
  pieces: {
    hand: {
      at: { down: [1, 3], up: [20, 3], side: [1, 8] },
      down: { rest: SPEAR, plant: { at: [1, 4], grid: SPEAR } },
      up: { rest: SPEAR, plant: { at: [20, 4], grid: SPEAR } },
      side: { rest: SPEAR, plant: { at: [1, 9], grid: SPEAR } },
    },
  },
});

const guard = rig({
  name: "guard",
  ...frame,
  group: "cast",
  parts: {
    shadow: { blob: shadow },
    body: { base: skin },
    uniform: { kit },
    face: { stern },
    hair: { helmet },
    book: { spear },
  },
  frames: {
    idle0: {},
    left: { head: "look" },
    idle1: { torso: [0, -1] },
    walk0: (d) => ({ ...walkArms(d, "R"), hand: [0, 0] }) as never,
    walk1: { torso: [0, -1] },
    walk2: (d) => ({ ...walkArms(d, "L"), hand: [0, 0] }) as never,
    walk3: { torso: [0, -1] },
    halt0: { hand: "plant", head: "shout" },
    halt1: (d) =>
      ({
        hand: "plant",
        head: "shout",
        ...(d === "side" ? { armR: "fwd" } : { armL: "raise" }),
      }) as never,
  },
  anim: {
    idle: {
      frames: ["idle0", "idle0", "left", "left", "idle0", "idle1", "idle0", "idle0"],
      fps: 3,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 5 },
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
        book: "spear",
      },
      slots: { skin: "warm", hair: "black" },
    },
  },
});

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
      const band = along < CONE_LEN * 0.4 ? "Y" : along < CONE_LEN * 0.75 ? "y" : "w";
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
