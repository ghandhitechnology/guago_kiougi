import { type PartDef, rig } from "../../format.ts";
import {
  blanket,
  catears,
  glasses,
  goggles,
  gradcap,
  hairclip,
  headband,
  headphones,
  lanyard,
  mask,
  sash,
  tortoise,
  wreath,
} from "../../student/accessories.ts";
import { frame, shadow, skin, withKo } from "../../student/base.ts";
import { textbook } from "../../student/book.ts";
import { withDerived } from "../../student/derive.ts";
import { bright, cool, goofy, sharp, shy, sleepy } from "../../student/faces.ts";
import { anims, frames } from "../../student/frames.ts";
import {
  blazer,
  cardigan,
  gym,
  labcoat,
  raincoat,
  shirt,
  varsity,
} from "../../student/garments.ts";
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

/** Every part of every layer with the poses `withDerived` makes from its own drawings. */
function derived(
  layers: Readonly<Record<string, Readonly<Record<string, PartDef>>>>,
): Record<string, Record<string, PartDef>> {
  return Object.fromEntries(
    Object.entries(layers).map(([layer, parts]) => [
      layer,
      Object.fromEntries(Object.entries(parts).map(([name, p]) => [name, withDerived(p)])),
    ]),
  );
}

export default rig({
  name: "student",
  probe: "pairs",
  clean: true,
  ...frame,
  parts: derived({
    shadow: { blob: shadow },
    body: { base: withKo(skin) },
    uniform: { blazer, shirt, gym, cardigan },
    jacket: { varsity, labcoat, raincoat },
    face: { bright, sleepy, sharp, goofy, shy, cool },
    hair: { crop, spiky, bob, long, ponytail, curly, buzz, twintails, bun, braids, shag, undercut },
    accessory: {
      glasses,
      goggles,
      headphones,
      hairclip,
      mask,
      lanyard,
      blanket,
      gradcap,
      headband,
      catears,
      armband: sash,
      wreath,
      tortoise,
    },
    book: { textbook },
  }),
  frames,
  anim: anims,
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
