import {
  curls,
  dress,
  feet,
  group,
  IDLE,
  knot,
  type Placed,
  person,
  plain,
  rosy,
  shins,
  WALK,
} from "../../folk.ts";
import { type Dir, type Legend, part, sprite } from "../../format.ts";
import { pythagorean, pythagoreanBean, pythagoreanFirst } from "./page1-mentors.ts";
import { ink, walkArms } from "./student.ts";

/**
 * Page 1's people who come in more than one: the Pythagoreans, who move and stop together, the
 * 아고라's children with their hoop, and the spectators who fill 엘레아's stand and the 리케이온's
 * lecture hall. Each is a sprite composited from the same baked figures as everyone else.
 *
 * - `pythagorean-order`: three of the order side by side, breathing in step. `count` raises
 *   three hands at once; `walk`, `walkDown` and `walkUp` step in perfect unison. The one in the
 *   middle keeps looking off to the side, where the beans are.
 * - `agora-children`: two children running a hoop across the square, the second one chasing.
 * - `spectator-sit-a` to `-c`, `spectator-stand-a` and `-b`: one person each, to scatter on the
 *   tiers. `idle` sways a little; `cheer` is both arms up.
 * - `crowd-a` to `-c`: the same three as walking figures, for an audience that has to face
 *   whoever it is listening to. `idle`, `walk`, `talk`, `sit`, `cheer`, `sitCheer`.
 */

// The order -------------------------------------------------------------------------------------

const third = pythagorean("pythagorean-third", "fair", false);
const ORDER = [pythagoreanFirst, pythagoreanBean, third] as const;

const row = (key: (i: number) => string, dir: Dir, spread = 16): Placed[] =>
  ORDER.map((person, i) => ({
    person,
    key: `${dir}/${key(i)}`,
    at: dir === "side" ? [16 + i * spread, 27] : [13 + i * spread, i === 1 ? 27 : 26],
  }));

const order = group([58, 30], {
  idle0: row(() => "idle0", "down"),
  idle1: row(() => "idle1", "down"),
  look0: row((i) => (i === 1 ? "beans0" : "idle0"), "down"),
  look1: row((i) => (i === 1 ? "beans1" : "idle1"), "down"),
  count0: row(() => "count0", "down"),
  count1: row(() => "count1", "down"),
  ...Object.fromEntries(
    [0, 1, 2, 3].flatMap((f) => [
      [`walkSide${f}`, row(() => `walk${f}`, "side", 12)],
      [`walkDown${f}`, row(() => `walk${f}`, "down")],
      [`walkUp${f}`, row(() => `walk${f}`, "up")],
    ]),
  ),
});

const pythagoreanOrder = sprite({
  name: "pythagorean-order",
  group: "page1-cast",
  size: [58, 30],
  origin: [29, 28],
  palette: order.palette,
  lone: order.lone,
  shadow: order.shadow,
  frames: order.frames,
  anim: {
    idle: {
      frames: [
        "idle0",
        "idle0",
        "idle1",
        "idle1",
        "look0",
        "look1",
        "look0",
        "idle0",
        "idle1",
        "idle1",
      ],
      fps: 2,
    },
    count: {
      frames: ["idle0", "count0", "count1", "count0", "count1", "idle0"],
      fps: 4,
      loop: false,
    },
    walk: { frames: ["walkSide0", "walkSide1", "walkSide2", "walkSide3"], fps: 6 },
    walkDown: { frames: ["walkDown0", "walkDown1", "walkDown2", "walkDown3"], fps: 6 },
    walkUp: { frames: ["walkUp0", "walkUp1", "walkUp2", "walkUp3"], fps: 6 },
  },
});

// The children ----------------------------------------------------------------------------------

/** A child: the same head on a shorter body, arms bent to run. */
const run = (d: Dir, lead: "R" | "L"): Record<string, unknown> => ({
  ...walkArms(d, lead),
  torso: [0, 3],
  armR: "read",
  armL: "read",
  hand: [0, 3],
});

const HOOP_KIT: Legend = { ...ink, D: "wood.deep", o: "wood.mid", b: "wood.light" };
/** The hoop, rolling ahead of the stick; the mark on it goes round. */
const hoop = part({
  palette: HOOP_KIT,
  pieces: {
    hand: {
      at: { down: [15, 13], up: [15, 13], side: [16, 10] },
      ...(Object.fromEntries(
        (["down", "up", "side"] as const).map((d) => [
          d,
          Object.fromEntries(
            [0, 1, 2, 3].map((f) => {
              const rows = [
                "..DDDD..",
                ".DobbbD.",
                "Do....oD",
                "Db....bD",
                "Db....bD",
                "Do....oD",
                ".DooooD.",
                "..DDDD..",
              ].map((r) => [...r]);
              const spot = [
                [1, 3],
                [3, 1],
                [6, 4],
                [4, 6],
              ][f] as [number, number];
              (rows[spot[1]] as string[])[spot[0]] = "D";
              return [f === 0 ? "rest" : `roll${f}`, rows.map((r) => r.join("")).join("\n")];
            }),
          ),
        ]),
      ) as Record<string, unknown>),
    },
  },
});

const hoopKid = person({
  name: "agora-hoop-kid",
  skin: "warm",
  parts: {
    uniform: dress({ cloth: "sea", length: "kid", sleeves: "bare" }),
    jacket: shins,
    face: rosy,
    hair: curls("black"),
    book: hoop,
  },
  frames: {
    idle0: { torso: [0, 3], armR: "read", armL: "read" },
    run0: (d: Dir) => run(d, "R") as never,
    run1: (d: Dir) => ({ ...run(d, "L"), hand: ["roll1", 0, 3] }) as never,
    run2: (d: Dir) => ({ ...run(d, "R"), hand: ["roll2", 0, 3] }) as never,
    run3: (d: Dir) => ({ ...run(d, "L"), hand: ["roll3", 0, 3] }) as never,
  },
  anim: { idle: { frames: ["idle0"], fps: 1 } },
});

const chaseKid = person({
  name: "agora-chase-kid",
  skin: "fair",
  parts: {
    uniform: dress({ cloth: "gold", length: "kid", sleeves: "bare" }),
    jacket: shins,
    face: rosy,
    hair: knot("brown"),
  },
  frames: {
    idle0: { torso: [0, 3], armR: "read", armL: "read" },
    run0: (d: Dir) => run(d, "L") as never,
    run1: (d: Dir) => ({ ...run(d, "R"), head: "shout" }) as never,
    run2: (d: Dir) => run(d, "L") as never,
    run3: (d: Dir) => ({ ...run(d, "R"), head: "shout" }) as never,
  },
  anim: { idle: { frames: ["idle0"], fps: 1 } },
});

const kids = group(
  [48, 28],
  Object.fromEntries(
    [0, 1, 2, 3].map((f) => [
      `run${f}`,
      [
        { person: chaseKid, key: `side/run${f}`, at: [12, 26 - (f % 2)] },
        { person: hoopKid, key: `side/run${(f + 1) % 4}`, at: [28, 26 - ((f + 1) % 2)] },
      ],
    ]),
  ),
);

const children = sprite({
  name: "agora-children",
  group: "page1-cast",
  size: [48, 28],
  origin: [24, 26],
  palette: kids.palette,
  lone: kids.lone,
  shadow: kids.shadow,
  frames: kids.frames,
  anim: {
    idle: { frames: ["run0", "run1", "run2", "run3"], fps: 8 },
  },
});

// Spectators ------------------------------------------------------------------------------------

const SIT = [0, 3] as const;
function spectator(
  name: string,
  look: Parameters<typeof person>[0]["parts"],
  skinTone: "fair" | "warm" | "deep",
) {
  return person({
    name,
    skin: skinTone,
    parts: look,
    frames: {
      sit0: { torso: SIT },
      sit1: { torso: SIT, head: "talk" },
      sitCheer0: { torso: SIT, armR: "raise", armL: "raise", head: "shout" },
      sitCheer1: { torso: [0, 2], armR: "raise", armL: "raise", head: "shout" },
      cheer0: { armR: "raise", armL: "raise", head: "shout" },
      cheer1: { armR: ["raise", 0, -1], armL: ["raise", 0, -1], head: "shout", torso: [0, -1] },
    },
    anim: {
      idle: IDLE,
      walk: WALK,
      sit: { frames: ["sit0", "sit0", "sit1", "sit0"], fps: 2 },
      cheer: { frames: ["cheer0", "cheer1"], fps: 6 },
      sitCheer: { frames: ["sitCheer0", "sitCheer1"], fps: 6 },
    },
  });
}

const crowd = [
  spectator(
    "crowd-a",
    {
      uniform: dress({ cloth: "stone", length: "long", sleeves: "short", drape: "navy" }),
      jacket: feet,
      face: plain,
      hair: curls("black"),
    },
    "warm",
  ),
  spectator(
    "crowd-b",
    {
      uniform: dress({ cloth: "rose", length: "long", sleeves: "short" }),
      jacket: feet,
      face: rosy,
      hair: knot("black"),
    },
    "fair",
  ),
  spectator(
    "crowd-c",
    {
      uniform: dress({ cloth: "olive", length: "long", sleeves: "long", drape: "clay" }),
      jacket: feet,
      face: plain,
      hair: curls("grey"),
    },
    "deep",
  ),
] as const;

function single(name: string, who: (typeof crowd)[number], seated: boolean) {
  const g = group(
    [24, 28],
    seated
      ? {
          idle0: [{ person: who, key: "down/sit0", at: [12, 26] }],
          idle1: [{ person: who, key: "down/sit1", at: [12, 26] }],
          cheer0: [{ person: who, key: "down/sitCheer0", at: [12, 26] }],
          cheer1: [{ person: who, key: "down/sitCheer1", at: [12, 26] }],
        }
      : {
          idle0: [{ person: who, key: "down/idle0", at: [12, 26] }],
          idle1: [{ person: who, key: "down/idle1", at: [12, 26] }],
          cheer0: [{ person: who, key: "down/cheer0", at: [12, 26] }],
          cheer1: [{ person: who, key: "down/cheer1", at: [12, 26] }],
        },
  );
  return sprite({
    name,
    group: "page1-cast",
    size: [24, 28],
    origin: [12, 26],
    palette: g.palette,
    lone: g.lone,
    shadow: g.shadow,
    frames: g.frames,
    anim: {
      idle: { frames: ["idle0", "idle0", "idle1", "idle0"], fps: 2 },
      cheer: { frames: ["cheer0", "cheer1", "cheer0", "cheer1"], fps: 6 },
    },
  });
}

export default [
  pythagoreanOrder,
  children,
  single("spectator-sit-a", crowd[0], true),
  single("spectator-sit-b", crowd[1], true),
  single("spectator-sit-c", crowd[2], true),
  single("spectator-stand-a", crowd[0], false),
  single("spectator-stand-b", crowd[1], false),
  ...crowd,
];
