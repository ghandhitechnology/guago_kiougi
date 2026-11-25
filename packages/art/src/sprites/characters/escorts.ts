import { curls, dress, person, petasos, rosy, shins, WALK } from "../../folk.ts";
import { type Dir, part } from "../../format.ts";
import { gnomon, tablet } from "../bosses/freed.ts";
import { ink, walkArms } from "./student.ts";

/**
 * The three helpers a player walks out through a field full of 오답 on an escort notice. They
 * are not fighters: `scared` is how they walk out there, hunched and quick, clutching what they
 * carry; `relief` is the arrival, arms up and then everything let go. `idle`, `walk`, `talk`
 * and one habit each:
 *
 * - `pythagorean-junior`: the order's youngest, white linen and the fillet, practising walking
 *   diagonally because the elders finally allowed it. `idle` takes a diagonal step and checks.
 * - `lyceum-scribe`: takes down everything 아리스토텔레스 says on a wax tablet, the specimen box
 *   strapped to his back. `idle` writes.
 * - `survey-helper`: carries 아리스타르코스's measuring stick, twice his height, and is scolded
 *   whenever he steps on a shadow. `idle` hops over one.
 */

/** The school's white fillet across the forehead. */
const fillet = part({
  palette: { ...ink, G: "stone.deep", w: "stone.bright", q: "stone.light" },
  pieces: {
    head: {
      at: { down: [4, 5], up: [4, 5], side: [5, 5] },
      down: "GwwwwwwwwwwwwqqG",
      up: "GwwwwwwwwwwwwqqG",
      side: "GwwwwwwwwqqG",
    },
  },
});

/** The specimen box on the scribe's back. */
const box = part({
  palette: { ...ink, D: "wood.deep", B: "wood.dark", o: "wood.mid", b: "wood.light" },
  pieces: {
    torso: {
      at: { down: [8, 12], up: [7, 12], side: [4, 13] },
      down: "DDDDDDDD",
      up: `
        DDDDDDDDDD
        DbbbbbbboD
        DboooooooD
        DDDDDDDDDD
        DbooooooBD
        DbooooooBD
        DDDDDDDDDD
      `,
      side: `
        DDDD
        DboD
        DDDD
        DbBD
        DbBD
        DDDD
      `,
    },
  },
});

const scaredWalk = (lead: "R" | "L") => (d: Dir) =>
  ({
    ...walkArms(d, lead),
    ...(d === "side" ? { armR: "read" } : { armR: "read", armL: "read" }),
    torso: d === "side" ? [1, 1] : [0, 1],
    head: "worry",
  }) as never;

/** Frames every helper shares: talk, the scared walk, and the arrival. */
const helper = {
  talk0: { head: "talk" },
  talk1: { head: "rest" },
  scared0: scaredWalk("R"),
  scared1: (d: Dir) =>
    ({
      ...(d === "side" ? { armR: "read" } : { armR: "read", armL: "read" }),
      head: "worry",
    }) as never,
  scared2: scaredWalk("L"),
  scared3: (d: Dir) =>
    ({
      ...(d === "side" ? { armR: "read" } : { armR: "read", armL: "read" }),
      head: "worry",
    }) as never,
  relief0: { armR: "raise", armL: "raise", head: "talk", torso: [0, -1] },
  relief1: { torso: [0, 1], head: "shut" },
} as const;
const helperAnims = {
  walk: WALK,
  talk: { frames: ["talk0", "talk1", "talk0", "idle0"], fps: 4 },
  scared: { frames: ["scared0", "scared1", "scared2", "scared3"], fps: 9 },
  relief: {
    frames: ["relief0", "relief0", "relief0", "relief1", "relief1", "relief1", "idle0"],
    fps: 4,
    loop: false,
  },
};

const junior = person({
  name: "pythagorean-junior",
  skin: "warm",
  parts: {
    uniform: dress({ cloth: "stone", length: "short", sleeves: "short", belt: "gold.mid" }),
    jacket: shins,
    face: rosy,
    hair: curls("black"),
    accessory: fillet,
  },
  frames: {
    ...helper,
    step0: (d: Dir) =>
      ({ torso: d === "side" ? [1, 1] : [1, 1], legR: d === "side" ? "fwd" : "lift" }) as never,
    step1: { head: "look" },
  },
  anim: {
    ...helperAnims,
    idle: {
      frames: ["idle0", "idle0", "idle1", "idle0", "step0", "step0", "step1", "idle0"],
      fps: 3,
    },
  },
});

const scribe = person({
  name: "lyceum-scribe",
  skin: "fair",
  parts: {
    uniform: dress({ cloth: "stone", length: "short", sleeves: "short", drape: "plum" }),
    jacket: shins,
    face: rosy,
    hair: curls("brown"),
    accessory: box,
    book: tablet,
  },
  frames: {
    ...helper,
    idle0: (d: Dir) => (d === "up" ? {} : { armR: "read", hand: "write", head: "look" }) as never,
    idle1: (d: Dir) =>
      (d === "up"
        ? { torso: [0, 1] }
        : { armR: "read", hand: ["write", 1, 0], head: "look" }) as never,
  },
  anim: {
    ...helperAnims,
    idle: { frames: ["idle0", "idle1", "idle0", "idle1", "idle0", "talk1"], fps: 4 },
  },
});

const surveyor = person({
  name: "survey-helper",
  skin: "deep",
  parts: {
    uniform: dress({ cloth: "clay", length: "short", sleeves: "bare", belt: "wood.deep" }),
    jacket: shins,
    face: rosy,
    hair: curls("black"),
    accessory: petasos("gold"),
    book: gnomon,
  },
  frames: {
    ...helper,
    hop0: { head: "look", torso: [0, 1] },
    hop1: { head: "look", torso: [0, -2], legL: "lift", legR: "lift", hand: [0, -2] },
  },
  anim: {
    ...helperAnims,
    idle: {
      frames: ["idle0", "idle0", "idle1", "idle1", "hop0", "hop1", "hop1", "idle0"],
      fps: 4,
      jump: 0.4,
    },
  },
});

export default [junior, scribe, surveyor];
