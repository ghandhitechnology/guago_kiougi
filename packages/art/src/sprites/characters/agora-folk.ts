import {
  baldBeard,
  curls,
  curlsBeard,
  dress,
  face,
  feet,
  kerchief,
  knot,
  person,
  petasos,
  pilos,
  plain,
  rosy,
  shins,
  WALK,
  wreath,
} from "../../folk.ts";
import { type Dir, type Legend, part } from "../../format.ts";
import { ink, walkArms } from "./student.ts";

/**
 * The people of the 아고라, each at what they were doing before the tear opened in their square
 * and still doing now, with an opinion about it. Each one's `idle` is their work, looping; their
 * signature is the thing they do now and then. The spot each stands at is the map's mark of the
 * same name.
 *
 * - `agora-potter`: a big patient man in a felt cap and a clay-streaked apron, at the kick wheel.
 *   `idle` throws a pot; `wipe` wipes his brow with a clay hand.
 * - `agora-barber`: lean, neat, talks the whole time. `idle` trims; `strop` stands back to look.
 * - `agora-customer`: half-trimmed, asleep in the barber's chair under the cloth. `idle` dozes;
 *   `flinch` when the razor comes too close.
 * - `agora-cook`: a broad woman in a kerchief over the brazier. `idle` stirs; `taste` tastes.
 * - `agora-pointer` and `agora-counter`: two citizens arguing about the tear, one jabbing a
 *   finger at it, one counting off his reasons. `idle` is the argument; `shout` and `tally`.
 * - `agora-fishmonger`: a loud woman holding up the morning's fish. `idle` hawks; `shout`.
 * - `agora-water`: a young woman with a hydria on her shoulder, back and forth from the fountain.
 *   `idle` steadies the jar; `walk` carries it.
 * - `agora-sleeper`: an old man asleep in the stoa's shade, by the dog. `idle` snores; `wake`
 *   opens one eye at the tear and shuts it again.
 * - `agora-sophist`: a wreathed talker in a bordered himation, charging by the hour. `idle`
 *   orates; `flourish`.
 * - `agora-messenger`: a runner in a petasos who is always passing through. `walk` runs; `idle`
 *   catches his breath; `wave`.
 */

// Things in hand --------------------------------------------------------------------------------

const KIT: Legend = {
  ...ink,
  D: "wood.deep",
  B: "wood.dark",
  o: "wood.mid",
  b: "wood.light",
  G: "stone.deep",
  g: "stone.mid",
  q: "stone.light",
  w: "stone.bright",
  F: "sea.deep",
  f: "sea.dark",
  s: "sea.mid",
  L: "sea.light",
  T: "clay.deep",
  t: "clay.dark",
  u: "clay.mid",
  U: "clay.light",
};

/** One held item: a grid per pose and direction, at the student book's places. */
function held(grids: {
  rest: string;
  raise?: string;
  front?: string;
  side?: string;
  sideFront?: string;
}) {
  return part({
    palette: KIT,
    lone: "~",
    pieces: {
      hand: {
        at: { down: [2, 17], up: [18, 17], side: [5, 18] },
        down: {
          rest: grids.rest,
          ...(grids.raise ? { raise: { at: [0, 3], grid: grids.raise } } : {}),
          ...(grids.front ? { front: { at: [7, 17], grid: grids.front } } : {}),
        },
        up: { rest: grids.rest, raise: ".", front: "." },
        side: {
          rest: grids.side ?? grids.rest,
          ...(grids.raise ? { raise: { at: [0, 12], grid: grids.side ?? grids.raise } } : {}),
          ...(grids.sideFront ? { front: { at: [18, 12], grid: grids.sideFront } } : {}),
        },
      },
    },
  });
}

const razor = held({
  rest: "GG\nGq\nGq\nDD",
  raise: "GG\nGq\nDD",
  front: "GGG.\nGqqG\n.DD.",
  sideFront: "GGG\nGqG\nDD.",
});

const spoon = held({
  rest: ".DD.\n.Db.\n.Db.\n.Db.\nDobD\n.DD.",
  front: ".DD.\n.Db.\n.Db.\nDobD\n.DD.",
  sideFront: "DDDD..\nDbbD..\n.DDbD.\n...DbD\n....DD",
});

const fish = held({
  rest: ".FF.\nFLsF\nFsfF\nFsfF\n.Ff.\nFF.F",
  raise: ".FF.\nFLsF\nFLsF\nFsfF\nFsfF\n.Ff.\nFF.F",
  side: ".FF.\nFLsF\nFsfF\nFsfF\n.Ff.\nFF.F",
});

/** The hydria on her shoulder, held up by her left hand. */
const hydria = part({
  palette: KIT,
  pieces: {
    torso: {
      at: { down: [15, 5], up: [2, 5], side: [2, 6] },
      down: `
        ..TTT..
        .TUuuT.
        TTTTTTT
        TUUuuuT
        TUuuutT
        TUuuutT
        .TuutT.
        ..TTT..
      `,
      up: `
        ..TTT..
        .TuuuT.
        TTTTTTT
        TUuuutT
        TUuuutT
        TuuuttT
        .TuutT.
        ..TTT..
      `,
      side: `
        ..TTT..
        .TUuuT.
        TTTTTTT
        TUUuuuT
        TUuuutT
        TUuuutT
        .TuutT.
        ..TTT..
      `,
    },
  },
});

/** A runner's satchel on its strap. */
const satchel = part({
  palette: KIT,
  pieces: {
    torso: {
      at: { down: [8, 13], up: [8, 13], side: [6, 15] },
      down: `
        D.......
        .D......
        ..D.....
        ...D....
        ....D...
        ....DDDD
        ....DbbD
        ....DDDD
      `,
      up: `
        .......D
        ......D.
        .....D..
        ....D...
        ...D....
        DDDD....
        DooD....
        DDDD....
      `,
      side: `
        DDDD
        DboD
        DooD
        DDDD
      `,
    },
  },
});

/** The snore over a sleeper's head. */
const snore = part({
  palette: { ...ink, Z: "stone.bright" },
  lone: "Z",
  pieces: {
    head: {
      at: { down: [16, -1], up: [16, -1], side: [14, -1] },
      down: { rest: ".", z0: "ZZZ\n.Z.\nZZZ", z1: "ZZ\nZZ" },
      up: { rest: ".", z0: "ZZZ\n.Z.\nZZZ", z1: "ZZ\nZZ" },
      side: { rest: ".", z0: "ZZZ\n.Z.\nZZZ", z1: "ZZ\nZZ" },
    },
  },
});

// Poses -----------------------------------------------------------------------------------------

/** Sitting: the body lowered onto a stool, the robe pooled over the feet. */
const SIT = [0, 3] as const;
const sit = (extra: Record<string, unknown> = {}) => ({ torso: SIT, hand: SIT, ...extra });

const anim = (frames: string[], fps: number, loop = true) => ({ frames, fps, loop });

// The potter --------------------------------------------------------------------------------------

const potter = person({
  name: "agora-potter",
  skin: "deep",
  parts: {
    uniform: dress({ cloth: "wood", length: "short", sleeves: "bare", apron: "clay" }),
    jacket: shins,
    face: plain,
    hair: curlsBeard("black"),
    accessory: pilos("olive"),
  },
  frames: {
    idle0: sit({ armR: "read", armL: "read", head: "look" }),
    idle1: sit({ armR: ["read", 0, -1], armL: ["read", 0, -1], head: "look" }),
    throw2: sit({ armR: ["read", 0, -2], armL: ["read", 0, -2], head: "look" }),
    wipe0: sit({ armL: "mouth", armR: "read", head: "shut" }),
  },
  anim: {
    idle: anim(["idle0", "idle1", "throw2", "idle1"], 4),
    walk: WALK,
    wipe: anim(["idle0", "wipe0", "wipe0", "wipe0", "idle0"], 3, false),
  },
});

// The barber and his customer ---------------------------------------------------------------------

const cutting = (d: Dir) => (d === "side" ? "strike" : "raise");

const barber = person({
  name: "agora-barber",
  skin: "warm",
  parts: {
    uniform: dress({ cloth: "sea", length: "short", sleeves: "short", drape: "stone" }),
    jacket: shins,
    face: plain,
    hair: curlsBeard("brown"),
    book: razor,
  },
  frames: {
    idle0: (d: Dir) =>
      ({ armR: cutting(d), hand: d === "side" ? "front" : "rest", head: "talk" }) as never,
    idle1: (d: Dir) =>
      ({
        armR: [cutting(d), 0, 1],
        hand: d === "side" ? ["front", 0, 1] : [0, 1],
        head: "rest",
      }) as never,
    strop0: (d: Dir) => ({ torso: d === "side" ? [-1, 0] : [0, -1], head: "rest" }) as never,
  },
  anim: {
    idle: anim(["idle0", "idle1", "idle0", "idle1", "idle0", "idle0"], 5),
    walk: WALK,
    strop: anim(["idle0", "strop0", "strop0", "strop0", "idle0"], 3, false),
  },
});

const customer = person({
  name: "agora-customer",
  skin: "fair",
  parts: {
    uniform: dress({ cloth: "stone", length: "long", sleeves: "long" }),
    jacket: feet,
    face: plain,
    hair: curlsBeard("grey"),
  },
  frames: {
    idle0: sit({ head: "shut" }),
    idle1: sit({ head: ["shut", 0, 1] }),
    flinch0: sit({ head: "shout", torso: [0, 2] }),
  },
  anim: {
    idle: anim(["idle0", "idle0", "idle1", "idle1"], 1.5),
    walk: WALK,
    flinch: anim(["idle0", "flinch0", "flinch0", "idle0"], 4, false),
  },
});

// The cook --------------------------------------------------------------------------------------

const stirring = (dx: number, dy: number) => (d: Dir) =>
  (d === "up" ? { armR: "raise" } : { armR: "strike", hand: ["front", dx, dy] }) as never;

const cook = person({
  name: "agora-cook",
  skin: "warm",
  parts: {
    uniform: dress({ cloth: "rose", length: "long", sleeves: "short", apron: "stone" }),
    jacket: feet,
    face: rosy,
    hair: knot("brown"),
    accessory: kerchief("stone"),
    book: spoon,
  },
  frames: {
    idle0: stirring(0, 0),
    idle1: stirring(1, 0),
    stir2: stirring(1, 1),
    stir3: stirring(0, 1),
    taste0: (d: Dir) =>
      (d === "down" ? { armL: "mouth", head: "shut" } : { head: "shut" }) as never,
  },
  anim: {
    idle: anim(["idle0", "idle1", "stir2", "stir3"], 5),
    walk: WALK,
    taste: anim(["idle0", "taste0", "taste0", "taste0", "idle0"], 3, false),
  },
});

// The two arguing ---------------------------------------------------------------------------------

const pointer = person({
  name: "agora-pointer",
  skin: "warm",
  parts: {
    uniform: dress({ cloth: "stone", length: "long", sleeves: "short", drape: "red" }),
    jacket: feet,
    face: plain,
    hair: curls("auburn"),
  },
  frames: {
    idle0: { armR: "strike", head: "talk" },
    idle1: (d: Dir) =>
      ({ armR: "strike", head: "rest", torso: d === "side" ? [1, 0] : [0, 1] }) as never,
    shout0: { armR: "raise", head: "shout" },
  },
  anim: {
    idle: anim(["idle0", "idle1", "idle0", "idle1", "idle0", "idle0"], 4),
    walk: WALK,
    shout: anim(["idle0", "shout0", "shout0", "shout0", "idle0"], 4, false),
  },
});

const counter = person({
  name: "agora-counter",
  skin: "fair",
  parts: {
    uniform: dress({ cloth: "olive", length: "long", sleeves: "short", drape: "stone" }),
    jacket: feet,
    face: plain,
    hair: baldBeard("white"),
  },
  frames: {
    idle0: { armR: "read", armL: "read", head: "talk" },
    idle1: { armR: ["read", 0, -1], armL: "read", head: "rest" },
    tally0: { armR: ["read", 0, -2], armL: "read", head: "talk" },
    tally1: { armR: ["read", 0, -3], armL: "read", head: ["talk", 0, 1] },
  },
  anim: {
    idle: anim(["idle0", "idle1", "tally0", "idle1"], 3),
    walk: WALK,
    tally: anim(["idle0", "idle1", "tally0", "tally1", "tally0", "tally1", "idle0"], 4, false),
  },
});

// The fishmonger ----------------------------------------------------------------------------------

const fishmonger = person({
  name: "agora-fishmonger",
  skin: "deep",
  parts: {
    uniform: dress({ cloth: "navy", length: "long", sleeves: "bare", apron: "stone" }),
    jacket: feet,
    face: rosy,
    hair: knot("black"),
    accessory: kerchief("sea"),
    book: fish,
  },
  frames: {
    idle0: { armR: "raise", hand: "raise", head: "shout" },
    idle1: { armR: ["raise", 0, -1], hand: ["raise", 0, -1], head: "talk" },
    hawk2: { armR: ["raise", 1, -1], hand: ["raise", 1, -1], head: "shout" },
    shout0: { armR: "raise", hand: "raise", head: ["shout", 0, -1], torso: [0, -1] },
  },
  anim: {
    idle: anim(["idle0", "idle1", "hawk2", "idle1"], 4),
    walk: WALK,
    shout: anim(["idle0", "shout0", "shout0", "idle0"], 4, false),
  },
});

// The water-carrier -------------------------------------------------------------------------------

const carry = (d: Dir) => ({ armL: d === "side" ? "fwd" : "raise" });

const water = person({
  name: "agora-water",
  skin: "fair",
  parts: {
    uniform: dress({ cloth: "rose", length: "long", sleeves: "short", belt: "gold.mid" }),
    jacket: feet,
    face: rosy,
    hair: knot("auburn"),
    accessory: hydria,
  },
  frames: {
    idle0: (d: Dir) => carry(d) as never,
    idle1: (d: Dir) => ({ ...carry(d), torso: [0, 1] }) as never,
    walk0: (d: Dir) => ({ ...walkArms(d, "R"), ...carry(d) }) as never,
    walk1: (d: Dir) => ({ ...carry(d), torso: [0, -1] }) as never,
    walk2: (d: Dir) => ({ ...walkArms(d, "L"), ...carry(d) }) as never,
    walk3: (d: Dir) => ({ ...carry(d), torso: [0, -1] }) as never,
    steady0: (d: Dir) =>
      ({ ...carry(d), head: "look", torso: d === "side" ? [-1, 0] : [1, 0] }) as never,
  },
  anim: {
    idle: anim(["idle0", "idle0", "idle1", "idle1", "idle0", "steady0", "idle0"], 2),
    walk: anim(["walk0", "walk1", "walk2", "walk3"], 5),
    steady: anim(["idle0", "steady0", "steady0", "idle0"], 3, false),
  },
});

// The old man in the shade ------------------------------------------------------------------------

const sleeper = person({
  name: "agora-sleeper",
  skin: "warm",
  parts: {
    uniform: dress({ cloth: "clay", length: "long", sleeves: "long", drape: "wood" }),
    jacket: feet,
    face: plain,
    hair: baldBeard("grey"),
    accessory: snore,
  },
  frames: {
    idle0: sit({ head: "shut" }),
    idle1: sit({ head: ["z0", 0, 1] }),
    snore2: sit({ head: ["z1", 0, 1] }),
    wake0: sit({ head: "rest" }),
  },
  anim: {
    idle: anim(["idle0", "idle0", "idle1", "snore2", "idle1", "idle0"], 1.5),
    walk: WALK,
    wake: anim(["idle0", "wake0", "wake0", "idle0"], 2, false),
  },
});

// The sophist -------------------------------------------------------------------------------------

const smug = face(
  {
    rest: "...e,....,e...\n...ee....ee...\n..............\n.....-..-.....",
    talk: "...e,....,e...\n...ee....ee...\n..............\n......!!......",
    shout: "...^e....^e...\n...ee....ee...\n.....!!!!.....\n......!!......",
    shut: "..............\n...--....--...\n..............\n.....-..-.....",
    look: "..............\n...ee....ee...\n..............\n.....-..-.....",
  },
  {
    rest: "...........e,..\n...........ee..\n...............\n............-..",
    talk: "...........e,..\n...........ee..\n...............\n............!!.",
    shout: "...........^e..\n...........ee..\n............!!.\n............!!.",
    shut: "...............\n...........--..\n...............\n............-..",
    look: "...............\n...........ee..\n...............\n............-..",
  },
);

const sophist = person({
  name: "agora-sophist",
  skin: "fair",
  parts: {
    uniform: dress({
      cloth: "gold",
      length: "long",
      sleeves: "long",
      drape: "navy",
      belt: "navy.deep",
    }),
    jacket: feet,
    face: smug,
    hair: curlsBeard("black"),
    accessory: wreath,
  },
  frames: {
    idle0: { armR: "raise", head: "talk" },
    idle1: { armR: "raise", armL: "fling", head: "rest" },
    orate2: { armL: "raise", head: "talk" },
    flourish0: { armR: "fling", armL: "fling", head: "shout", torso: [0, -1] },
  },
  anim: {
    idle: anim(["idle0", "idle1", "orate2", "idle1"], 3),
    walk: WALK,
    flourish: anim(["idle0", "flourish0", "flourish0", "flourish0", "idle0"], 3, false),
  },
});

// The messenger -----------------------------------------------------------------------------------

const messenger = person({
  name: "agora-messenger",
  skin: "deep",
  parts: {
    uniform: dress({ cloth: "clay", length: "short", sleeves: "bare" }),
    jacket: shins,
    face: plain,
    hair: curls("black"),
    accessory: petasos("stone"),
    book: satchel,
  },
  frames: {
    idle0: { torso: [0, 1], head: "shut" },
    idle1: { torso: [0, 2], head: "talk" },
    walk0: (d: Dir) => ({ ...walkArms(d, "R"), torso: d === "side" ? [1, 0] : [0, 0] }) as never,
    walk1: (d: Dir) => ({ torso: d === "side" ? [1, -1] : [0, -1] }) as never,
    walk2: (d: Dir) => ({ ...walkArms(d, "L"), torso: d === "side" ? [1, 0] : [0, 0] }) as never,
    walk3: (d: Dir) => ({ torso: d === "side" ? [1, -1] : [0, -1] }) as never,
    wave0: { armR: "raise", head: "talk" },
  },
  anim: {
    idle: anim(["idle0", "idle1"], 3),
    walk: anim(["walk0", "walk1", "walk2", "walk3"], 10),
    wave: anim(["idle0", "wave0", "wave0", "wave0", "idle0"], 4, false),
  },
});

export default [
  potter,
  barber,
  customer,
  cook,
  pointer,
  counter,
  fishmonger,
  water,
  sleeper,
  sophist,
  messenger,
];
