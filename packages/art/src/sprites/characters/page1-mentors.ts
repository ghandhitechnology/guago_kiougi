import { addPoses } from "../../figure.ts";
import type { Dir } from "../../format.ts";
import { rig } from "../../format.ts";
import {
  aristarchusFace,
  aristarchusHair,
  aristotleFace,
  aristotleHair,
  bake,
  base,
  feet,
  gnomon,
  himation,
  idle,
  lanyard,
  look,
  ochre,
  pythagoreanFace,
  pythagoreanHair,
  seaRobe,
  shins,
  tablet,
  walk,
  whiteRobe,
  zenoFace,
  zenoHair,
} from "../bosses/freed.ts";
import { frame, shadow, skin } from "./student.ts";

/**
 * Page 1's freed minds as people, walking the 아고라 and the campus after their fights, drawn
 * from the same parts as their boss art's freed designs (`bosses/freed.ts`), so the lecturer on
 * the stoa steps is the man players beat in the 리케이온. Each has `idle`, `walk`, `talk` and
 * the move that tells their idea without a word:
 *
 * - `aristotle-campus`: just proven wrong about four things and delighted to write it down.
 *   `jot`: he looks down and adds another category to the tablet.
 * - `zeno-campus`: polite, unhurried, and never quite finishes a gesture. `half`: a hand rises
 *   halfway to a point, then half of what is left, then half of that, and is lowered again.
 * - `pythagorean-campus`: the one who said 나는 first. `count`: a hand comes up and counts.
 * - `pythagorean-bean`: another of the order, who cannot stop checking where the bean sack is.
 *   `beans`: a glance sideways, a lean away, a shiver.
 * - `aristarchus-campus`: right too early, used to it. `chalk`: he crouches and draws the orbit
 *   again where everyone will walk through it. `squint`: a hand to the brim, eyes on the sun.
 */

const talkArm = (d: Dir) => (d === "side" ? { armR: "fwd" } : { armL: "fling" });

/** A lecturer's free hand opens out with every point; the tablet stays in the other. */
const lecturing = {
  talk0: (d: Dir) => talkArm(d) as never,
  talk1: (d: Dir) => ({ ...talkArm(d), head: [0, 1] }) as never,
};
const talk = { frames: ["idle0", "talk0", "talk1", "talk0", "idle0", "talk1"], fps: 5 };

const aristotle = bake(
  rig({
    name: "aristotle-campus",
    ...frame,
    group: "cast",
    parts: {
      shadow: { blob: shadow },
      body: { base: skin },
      uniform: { himation },
      jacket: { feet },
      face: { aristotleFace },
      hair: { aristotleHair },
      accessory: { lanyard },
      book: { tablet },
    },
    frames: {
      ...base,
      ...lecturing,
      jot0: { head: "look", hand: "write", armR: "read" },
      jot1: { head: ["look", 0, 1], hand: ["write", 1, 0], armR: "read", torso: [0, 1] },
    },
    anim: {
      idle,
      walk,
      talk,
      jot: {
        frames: ["idle0", "jot0", "jot1", "jot0", "jot1", "jot0", "idle0"],
        fps: 4,
        loop: false,
      },
    },
    looks: look(
      "lecturer",
      {
        uniform: "himation",
        jacket: "feet",
        face: "aristotleFace",
        hair: "aristotleHair",
        accessory: "lanyard",
        book: "tablet",
      },
      "warm",
    ),
  }),
);

/** 제논's face can bow, and talk without ever raising its voice. */
const zenoTalking = addPoses(zenoFace, {
  head: {
    down: {
      talk: `
        ...**....**...
        ...*^....^*...
        ..............
        ......!!......
      `,
    },
    side: {
      talk: `
        ...........**..
        ...........*^..
        ...............
        ............!!.
      `,
    },
  },
});

/** The hand rising by halves: each frame lifts it half as far as the last. */
const reach = (dy: number) => (d: Dir) =>
  (d === "side" ? { armR: ["fwd", 0, -dy] } : { armR: ["fling", 0, -dy] }) as never;

const zeno = bake(
  rig({
    name: "zeno-campus",
    ...frame,
    group: "cast",
    parts: {
      shadow: { blob: shadow },
      body: { base: skin },
      uniform: { seaRobe },
      jacket: { feet },
      face: { zenoTalking },
      hair: { zenoHair },
    },
    frames: {
      ...base,
      talk0: (d: Dir) =>
        ({ ...(d === "side" ? { armR: "fwd" } : { armR: "fling" }), head: "talk" }) as never,
      talk1: { head: "rest" },
      half1: reach(0),
      half2: reach(2),
      half3: reach(3),
      bow0: { head: ["bow", 0, 1], torso: [0, 1] },
    },
    anim: {
      idle,
      walk,
      talk: { frames: ["talk0", "talk1", "talk0", "idle0", "talk1"], fps: 4 },
      half: {
        frames: [
          "idle0",
          "half1",
          "half1",
          "half2",
          "half2",
          "half3",
          "half3",
          "half3",
          "half1",
          "bow0",
          "idle0",
        ],
        fps: 4,
        loop: false,
        jump: 0.4,
      },
    },
    looks: look(
      "polite",
      { uniform: "seaRobe", jacket: "feet", face: "zenoTalking", hair: "zenoHair" },
      "warm",
    ),
  }),
);

/** The order's faces: counting, talking, and glancing at the beans. */
const orderFace = addPoses(pythagoreanFace, {
  head: {
    down: {
      talk: `
        ...**....**...
        ...*^....^*...
        ..............
        ......!!......
      `,
      glance: `
        ..**....**....
        ..^*....^*....
        ..............
        ......--......
      `,
    },
    side: {
      talk: `
        ...........**..
        ...........*^..
        ...............
        ............!!.
      `,
      glance: `
        ..........**...
        ..........^*...
        ...............
        .............-.
      `,
    },
  },
});

export function pythagorean(name: string, skinTone: string, beans: boolean) {
  return bake(
    rig({
      name,
      ...frame,
      group: "cast",
      parts: {
        shadow: { blob: shadow },
        body: { base: skin },
        uniform: { whiteRobe },
        jacket: { feet },
        face: { orderFace },
        hair: { pythagoreanHair },
      },
      frames: {
        ...base,
        talk0: { head: "talk", armR: "raise" },
        talk1: { head: "rest", armR: ["raise", 0, 1] },
        count0: { armR: "raise", head: "talk" },
        count1: { armR: ["raise", 0, -1], head: "talk" },
        ...(beans
          ? {
              beans0: { head: "glance" },
              beans1: (d: Dir) =>
                ({ head: "glance", torso: d === "side" ? [-1, 0] : [1, 0] }) as never,
              beans2: (d: Dir) =>
                ({ head: "glance", torso: d === "side" ? [-2, 0] : [2, 0] }) as never,
            }
          : {}),
      },
      anim: {
        idle,
        walk,
        talk: { frames: ["talk0", "talk1", "talk0", "idle0"], fps: 4 },
        count: {
          frames: ["idle0", "count0", "count1", "count0", "count1", "idle0"],
          fps: 4,
          loop: false,
        },
        ...(beans
          ? {
              beans: {
                frames: [
                  "idle0",
                  "beans0",
                  "beans0",
                  "beans1",
                  "beans2",
                  "beans1",
                  "beans2",
                  "beans1",
                  "idle0",
                ],
                fps: 5,
                loop: false,
              },
            }
          : {}),
      },
      looks: look(
        beans ? "wary" : "first",
        { uniform: "whiteRobe", jacket: "feet", face: "orderFace", hair: "pythagoreanHair" },
        skinTone,
      ),
    }),
  );
}

export const pythagoreanFirst = pythagorean("pythagorean-campus", "deep", false);
export const pythagoreanBean = pythagorean("pythagorean-bean", "warm", true);

/** 아리스타르코스 can talk, squint at the sun, and chalk the orbit on the ground again. */
const aristarchusTalking = addPoses(aristarchusFace, {
  head: {
    down: {
      talk: `
        ...**....**...
        ...*^....^*...
        ..'........'..
        ......!!......
      `,
      down: `
        ..............
        ...**....**...
        ..'........'..
        ......--......
      `,
    },
    side: {
      talk: `
        ...........**..
        ...........*^..
        ..........'....
        ............!!.
      `,
      down: `
        ...............
        ...........**..
        ..........'....
        .............-.
      `,
    },
  },
});

const aristarchus = bake(
  rig({
    name: "aristarchus-campus",
    ...frame,
    group: "cast",
    parts: {
      shadow: { blob: shadow },
      body: { base: skin },
      uniform: { ochre },
      jacket: { shins },
      face: { aristarchusTalking },
      hair: { aristarchusHair },
      book: { gnomon },
    },
    frames: {
      ...base,
      talk0: { head: "talk", armL: "fling" },
      talk1: { head: "rest", armL: ["fling", 0, -1] },
      squint0: { armL: "raise", head: "squint" },
      squint1: { armL: "raise", head: ["squint", 0, -1] },
      chalk0: (d: Dir) =>
        ({ torso: [0, 2], head: "down", ...(d === "up" ? {} : { armR: "strike" }) }) as never,
      chalk1: (d: Dir) =>
        ({
          torso: [0, 2],
          head: "down",
          ...(d === "up" ? {} : { armR: ["strike", d === "side" ? 1 : -1, 0] }),
        }) as never,
    },
    anim: {
      idle,
      walk,
      talk: { frames: ["talk0", "talk1", "talk0", "idle0"], fps: 4 },
      squint: {
        frames: ["idle0", "squint0", "squint1", "squint1", "squint0", "idle0"],
        fps: 3,
        loop: false,
      },
      chalk: {
        frames: ["idle0", "chalk0", "chalk1", "chalk0", "chalk1", "chalk0", "chalk1", "idle0"],
        fps: 4,
        loop: false,
      },
    },
    looks: look(
      "measuring",
      {
        uniform: "ochre",
        jacket: "shins",
        face: "aristarchusTalking",
        hair: "aristarchusHair",
        book: "gnomon",
      },
      "fair",
    ),
  }),
);

export default [aristotle, zeno, pythagoreanFirst, pythagoreanBean, aristarchus];
