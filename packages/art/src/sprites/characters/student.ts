import { type Dir, rig, type Vec } from "../../format.ts";
import {
  glasses,
  goggles,
  hairclip,
  headphones,
  lanyard,
  mask,
} from "../../student/accessories.ts";
import { frame, shadow, skin, walkArms, withKo } from "../../student/base.ts";
import { textbook } from "../../student/book.ts";
import { bright, cool, goofy, sharp, shy, sleepy } from "../../student/faces.ts";
import { blazer, shirt, varsity } from "../../student/garments.ts";
import {
  bob,
  braids,
  bun,
  buzz,
  crop,
  curly,
  long,
  ponytail,
  shag,
  spiky,
  twintails,
  undercut,
} from "../../student/hair.ts";

/**
 * The student: a first-year two weeks into dorm life, textbook always in hand. The parts live in
 * `src/student/`; this file assembles the rig the player and the character creator use.
 */

// The skeleton and shared pieces every student-sized character is built from.
export {
  away,
  closed,
  frame,
  garment,
  ink,
  lone,
  mirror,
  shadow,
  skin,
  type Torso,
  transpose,
  walkArms,
  withKo,
} from "../../student/base.ts";

/** The book held up and a page turning; from behind only the head dips. */
const page = (d: Dir, book: string) =>
  d === "down"
    ? { armR: "read", armL: "read", hand: book, head: "read" }
    : d === "side"
      ? { armR: "read", hand: book, head: "read" }
      : { head: "read" };

const lean = (d: Dir): Vec => (d === "side" ? [1, 0] : d === "down" ? [0, 1] : [0, -1]);

export default rig({
  name: "student",
  probe: "pairs",
  clean: true,
  ...frame,
  parts: {
    shadow: { blob: shadow },
    body: { base: withKo(skin) },
    uniform: { blazer, shirt },
    jacket: { varsity },
    face: { bright, sleepy, sharp, goofy, shy, cool },
    hair: { crop, spiky, bob, long, ponytail, curly, buzz, twintails, bun, braids, shag, undercut },
    accessory: { glasses, goggles, headphones, hairclip, mask, lanyard },
    book: { textbook },
  },
  frames: {
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
  },
  anim: {
    idle: { frames: ["idle0", "idle1"], fps: 2 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 8 },
    attack: { frames: ["attack0", "attack1", "attack2", "attack3"], fps: 12, loop: false },
    hit: { frames: ["hit"], fps: 1, loop: false },
    ko: { frames: ["ko"], fps: 1, loop: false },
    yawn: { frames: ["yawn0", "yawn1", "yawn1", "yawn1", "yawn0"], fps: 5, loop: false },
    page: { frames: ["page0", "page0", "page1", "page2", "page0"], fps: 5, loop: false },
  },
  looks: {
    blazer: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "blazer",
        face: "bright",
        hair: "crop",
        book: "textbook",
      },
      slots: { skin: "fair", hair: "black" },
    },
    summer: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "shirt",
        face: "bright",
        hair: "ponytail",
        book: "textbook",
      },
      slots: { skin: "warm", hair: "brown" },
    },
    club: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "blazer",
        jacket: "varsity",
        face: "sharp",
        hair: "bob",
        accessory: "goggles",
        book: "textbook",
      },
      slots: { skin: "fair", hair: "chestnut", jacket: "crimson" },
    },
    reader: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "blazer",
        face: "sleepy",
        hair: "long",
        accessory: "glasses",
        book: "textbook",
      },
      slots: { skin: "fair", hair: "black" },
    },
    bedhead: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "shirt",
        jacket: "varsity",
        face: "sleepy",
        hair: "spiky",
        book: "textbook",
      },
      slots: { skin: "deep", hair: "blond", jacket: "navy" },
    },
    curls: {
      parts: {
        shadow: "blob",
        body: "base",
        uniform: "shirt",
        face: "sharp",
        hair: "curly",
        accessory: "glasses",
        book: "textbook",
      },
      slots: { skin: "warm", hair: "red", jacket: "forest" },
    },
  },
});
