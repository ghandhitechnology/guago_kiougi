import type { Anim, Dir, FramePose, Poses, Vec } from "../format.ts";
import { walkArms } from "./base.ts";

/**
 * The student's frames and animations, shared by every look. Bone names and the first frames
 * (idle to page) are what the cast rigs and the client already use; everything after them is
 * new and only the student rig has it.
 */

/** The book held up and a page turning; from behind only the head dips. */
const page = (d: Dir, book: string): Poses =>
  d === "down"
    ? { armR: "read", armL: "read", hand: book, head: "read" }
    : d === "side"
      ? { armR: "read", hand: book, head: "read" }
      : { head: "read" };

const lean = (d: Dir): Vec => (d === "side" ? [1, 0] : d === "down" ? [0, 1] : [0, -1]);

/** Hips on a chair or a bench. */
const seated = (d: Dir): Poses => ({
  torso: d === "side" ? [-1, 2] : [0, 2],
  legR: d === "up" ? "tuck" : "sit",
  legL: d === "up" ? "tuck" : "sit",
});

/** Kneeling upright, sitting back on the heels. */
const kneeling: Poses = { torso: [0, 3], legR: "kneel", legL: "kneel" };

/** Walking legs and the torso's bob, without the arms: for walking with something in hand. */
const stride = (d: Dir, i: number): Poses => {
  if (i === 1 || i === 3) return { torso: [0, -1], tail: [0, 1] };
  const lead = i === 0 ? "R" : "L";
  if (d === "side") {
    return lead === "R"
      ? { legR: "fwd", legL: "back", tail: [-1, 0] }
      : { legL: "fwd", legR: "back", tail: [-1, 0] };
  }
  return lead === "R" ? { legL: "lift" } : { legR: "lift" };
};

/** Asleep at a desk: head on folded arms, the book put away. Breathing moves the back only. */
const asleep = (d: Dir, breath: number): Poses => {
  if (d === "down") {
    return {
      torso: ["hide", 0, 2],
      head: ["crown", 0, 5 + breath],
      tail: "crown",
      armR: "fold",
      armL: "fold",
      legR: "hide",
      legL: "hide",
      hand: "away",
    };
  }
  const back: Vec = d === "side" ? [0, 2 + breath] : [0, 2 + breath];
  return {
    torso: back,
    head: d === "side" ? ["doze", 3, 3 - breath] : [0, 4 - breath],
    armR: ["fold", 0, -breath],
    armL: ["fold", 0, -breath],
    legR: d === "up" ? "tuck" : "sit",
    legL: d === "up" ? "tuck" : "sit",
    hand: "away",
  };
};

/** Arms and the book for a pose that needs both hands in front: the book goes under an arm. */
const both = (d: Dir, right: string): Poses =>
  d === "side" ? { armR: right, hand: "tuck" } : { armR: right, armL: "upper", hand: "tuck" };

/** The 절: 공수 standing, kneeling, then forehead to the floor. */
const bow = (d: Dir, step: 0 | 1 | 2): Poses => {
  if (step < 2) {
    return {
      ...(step === 1 ? kneeling : {}),
      armR: "gongsu",
      armL: "upper",
      head: "doze",
      hand: "drop",
    };
  }
  if (d === "down") {
    return {
      torso: "hide",
      head: ["crown", 0, 9],
      tail: "crown",
      armR: ["floor", 0, 1],
      armL: "floor",
      legR: "hide",
      legL: "hide",
      hand: "drop",
    };
  }
  if (d === "up") {
    return {
      torso: ["slump", 0, 5],
      head: [0, 1],
      armR: "hide",
      armL: "hide",
      legR: "kneel",
      legL: "kneel",
      hand: "drop",
    };
  }
  return {
    torso: "prone",
    head: "prone",
    tail: "prone",
    armR: "floor",
    armL: "hide",
    legR: "kneel",
    legL: "kneel",
    hand: "drop",
  };
};

/** A step of the dance: arms up and down, hips side to side. */
const dance = (d: Dir, step: 0 | 1 | 2 | 3): Poses => {
  if (step === 1 || step === 3) return { torso: [0, 1], hand: [0, 1] };
  const right = step === 0;
  if (d === "side") {
    return right
      ? { armR: "aloft", hand: "aloft", legR: "fwd", torso: [0, -1] }
      : { armR: "fwd", legL: "fwd", torso: [0, -1], hand: [1, -1] };
  }
  return right
    ? { armR: "raise", armL: "fling", hand: "raise", legL: "lift", torso: [-1, 0] }
    : { armL: "raise", armR: "fling", legR: "lift", torso: [1, 0], hand: [0, 2] };
};

/** 멘붕: hands on the head, the book on the floor, shaking. */
const panic = (shake: number, buckle = 0): Poses => ({
  torso: [shake, buckle],
  armR: "clutch",
  armL: "clutch",
  head: "panic",
  hand: ["clutch", shake, buckle],
  ...(buckle ? { legR: "lift", legL: "lift" } : {}),
});

export const frames: Readonly<Record<string, FramePose>> = {
  idle0: {},
  idle1: { torso: [0, 1], hand: [0, 1] },
  walk0: (d) => walkArms(d, "R") as never,
  walk1: { torso: [0, -1], tail: [0, 1], hand: [0, -1] },
  walk2: (d) => walkArms(d, "L") as never,
  walk3: { torso: [0, -1], tail: [0, 1], hand: [0, -1] },
  attack0: { armR: "raise", hand: "raise" },
  attack1: (d) => ({ armR: "strike", hand: "strike", head: "shout", torso: lean(d) }),
  attack2: { armR: "follow", hand: "follow", head: "shout" },
  attack3: (d) => ({ armR: "fwd", hand: d === "side" ? [1, 0] : [0, 1] }),
  hit: (d) =>
    d === "side"
      ? { torso: [-1, 0], hand: [-1, 0], head: "hurt" }
      : {
          torso: [0, -1],
          armR: "fling",
          armL: "raise",
          [d === "down" ? "legR" : "legL"]: "lift",
          hand: "fly",
          head: "hurt",
        },
  ko: {
    ground: "ko",
    armL: "ko",
    legL: "ko",
    legR: "ko",
    torso: "ko",
    armR: "ko",
    tail: "ko",
    head: "ko",
    hand: "ko",
  },
  yawn0: (d) =>
    d === "side"
      ? { armR: "mouth", head: "yawn" }
      : { armR: "raise", armL: "raise", hand: "raise", head: "yawn" },
  yawn1: (d) =>
    d === "side"
      ? { torso: [0, -1], armR: "mouth", head: "yawn", tail: [0, 1], hand: [0, -1] }
      : {
          torso: [0, -1],
          armR: "raise",
          armL: "raise",
          hand: ["raise", 0, -1],
          head: "yawn",
        },
  page0: (d) => page(d, "read0"),
  page1: (d) => page(d, "read1"),
  page2: (d) => page(d, "read2"),

  // Seated, asleep at a desk, and the opening's stretch at the 자습실 seat.
  sit0: (d) => ({ ...seated(d), hand: "lap" }),
  sit1: (d) => ({ ...seated(d), hand: "lap", head: [0, 1] }),
  sleep0: (d) => asleep(d, 0),
  sleep1: (d) => asleep(d, 1),
  stretch0: (d) =>
    d === "side"
      ? { ...seated(d), armR: "aloft", hand: "lap", head: "yawn" }
      : { ...seated(d), armR: "raise", armL: "raise", hand: "lap", head: "yawn" },
  stretch1: (d) =>
    d === "side"
      ? { ...seated(d), torso: [-1, 1], armR: ["aloft", 0, -1], hand: "lap", head: "yawn" }
      : { ...seated(d), torso: [0, 1], armR: "raise", armL: "raise", hand: "lap", head: "yawn" },
  rise: (d) =>
    d === "side"
      ? { torso: [0, 1], legR: "fwd", legL: "back", hand: [0, 1] }
      : { torso: [0, 1], legR: "lift", legL: "lift", hand: [0, 1] },

  // A paper cup at the water cooler.
  drink0: (d) =>
    d === "side" ? { armR: "mouth", hand: "drink" } : { armL: "mouth", hand: "drink" },
  drink1: (d) =>
    d === "side"
      ? { armR: "mouth", hand: "drink", head: "doze" }
      : { armL: "mouth", hand: "drink", head: "doze" },

  // Getting up after a 기절, and a level gained.
  revive0: { ...kneeling, head: "hurt", hand: "drop" },
  revive1: (d) =>
    d === "side"
      ? { torso: [0, 1], legR: "fwd", legL: "back", hand: [0, 1] }
      : { torso: [0, 1], legR: "lift", hand: [0, 1] },
  levelup0: { torso: [0, 1], hand: [0, 1] },
  levelup1: {
    torso: [0, -1],
    armR: "aloft",
    hand: "aloft",
    head: "shout",
    legR: "lift",
    legL: "lift",
  },

  // Carrying a box for a delivery quest.
  hold0: (d) => ({ ...both(d, "hold"), hand: "carry" }),
  hold1: (d) => ({ ...both(d, "hold"), hand: ["carry", 0, 1], torso: [0, 1] }),
  carry0: (d) => ({ ...stride(d, 0), ...both(d, "hold"), hand: "carry" }),
  carry1: (d) => ({ ...stride(d, 1), ...both(d, "hold"), hand: ["carry", 0, -1] }),
  carry2: (d) => ({ ...stride(d, 2), ...both(d, "hold"), hand: "carry" }),
  carry3: (d) => ({ ...stride(d, 3), ...both(d, "hold"), hand: ["carry", 0, -1] }),

  // The emote wheel (PLAN §12): 인사, 박수, ㅋㅋ, 졸림, 화이팅, 절, 춤, 멘붕.
  hello0: (d) =>
    d === "side" ? { armR: "wave0", head: "shout" } : { armL: "wave0", head: "shout" },
  hello1: (d) => (d === "side" ? { armR: "wave1" } : { armL: "wave1" }),
  clap0: (d) => ({ ...both(d, "clap0"), head: "laugh" }),
  clap1: (d) => ({ ...both(d, "clap1"), head: "laugh", torso: [0, 1], hand: ["tuck", 0, 1] }),
  lol0: (d) => ({ ...both(d, "belly"), head: "laugh", torso: d === "side" ? [-1, 0] : [0, 0] }),
  lol1: (d) => ({
    ...both(d, "belly"),
    head: ["laugh", 0, 1],
    torso: d === "side" ? [-1, 1] : [0, 1],
    hand: ["tuck", 0, 1],
  }),
  sleepy0: { head: ["doze", 0, 1], hand: [0, 1] },
  sleepy1: { head: ["doze", 0, 2], torso: [0, 1], hand: [0, 2] },
  sleepy2: { head: "panic", torso: [0, -1], hand: [0, -1] },
  fighting0: (d) => ({ ...both(d, "fist0"), head: "shout", torso: [0, -1], hand: ["tuck", 0, -1] }),
  fighting1: (d) => ({ ...both(d, "fist1"), head: "shout", torso: [0, 1], hand: ["tuck", 0, 1] }),
  bow0: (d) => bow(d, 0),
  bow1: (d) => bow(d, 1),
  bow2: (d) => bow(d, 2),
  dance0: (d) => dance(d, 0),
  dance1: (d) => dance(d, 1),
  dance2: (d) => dance(d, 2),
  dance3: (d) => dance(d, 3),
  panic0: panic(-1),
  panic1: panic(1),
  panic2: panic(0, 1),
};

const once = (frames: string[], fps: number, jump?: number): Anim => ({
  frames,
  fps,
  loop: false,
  ...(jump === undefined ? {} : { jump }),
});

export const anims: Readonly<Record<string, Anim>> = {
  idle: { frames: ["idle0", "idle1"], fps: 2 },
  walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 8 },
  attack: { frames: ["attack0", "attack1", "attack2", "attack3"], fps: 12, loop: false },
  hit: { frames: ["hit"], fps: 1, loop: false },
  ko: { frames: ["ko"], fps: 1, loop: false },
  yawn: { frames: ["yawn0", "yawn1", "yawn1", "yawn1", "yawn0"], fps: 5, loop: false },
  page: { frames: ["page0", "page0", "page1", "page2", "page0"], fps: 5, loop: false },
  sit: { frames: ["sit0", "sit0", "sit0", "sit1", "sit1", "sit1"], fps: 2 },
  sleep: { frames: ["sleep0", "sleep0", "sleep1", "sleep1"], fps: 2 },
  stretch: once(
    ["sit0", "stretch0", "stretch1", "stretch1", "stretch1", "stretch0", "sit0", "rise", "idle0"],
    5,
  ),
  drink: once(["idle0", "drink0", "drink1", "drink1", "drink1", "drink0", "idle0"], 5),
  revive: once(["ko", "revive0", "revive0", "revive1", "idle0"], 5, 0.5),
  levelup: once(
    ["levelup0", "levelup1", "levelup1", "levelup1", "levelup1", "levelup0", "idle0"],
    8,
  ),
  hold: { frames: ["hold0", "hold0", "hold1", "hold1"], fps: 2 },
  carry: { frames: ["carry0", "carry1", "carry2", "carry3"], fps: 8 },
  hello: once(["hello0", "hello1", "hello0", "hello1", "hello0", "hello1", "idle0"], 6),
  clap: once(["clap0", "clap1", "clap0", "clap1", "clap0", "clap1", "clap0", "clap1", "idle0"], 8),
  lol: once(["lol0", "lol1", "lol0", "lol1", "lol0", "lol1", "lol0", "lol1", "lol0", "idle0"], 8),
  sleepy: once(
    [
      "sleepy0",
      "sleepy1",
      "sleepy1",
      "sleepy0",
      "sleepy1",
      "sleepy1",
      "sleepy1",
      "sleepy2",
      "idle0",
    ],
    3,
  ),
  fighting: once(["fighting0", "fighting1", "fighting0", "fighting1", "fighting0", "idle0"], 6),
  bow: once(
    ["bow0", "bow0", "bow1", "bow2", "bow2", "bow2", "bow2", "bow1", "bow0", "idle0"],
    4,
    0.5,
  ),
  dance: once(
    ["dance0", "dance1", "dance2", "dance3", "dance0", "dance1", "dance2", "dance3", "idle0"],
    6,
  ),
  panic: once(
    ["panic0", "panic1", "panic0", "panic1", "panic2", "panic2", "panic0", "panic1", "idle0"],
    8,
  ),
};
