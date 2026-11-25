/**
 * Page 1's people for the cast table (`CAST_ART`): one block, spread in after the campus cast.
 * Each entry names the art build's rig or sprite, the move they make now and then (their `idle`
 * is their work and loops by itself), the map they live in, and, for the 아고라's townspeople,
 * the map mark they stand at. Portraits follow the id: `portrait-<id>`.
 */
export interface PageCast {
  readonly kind: "rig" | "sprite";
  readonly art: string;
  readonly signature: string;
  readonly home?: string;
  /** The map mark they stand at, when their place is a mark rather than an NPC spot. */
  readonly mark?: string;
}

export const CAST_PAGE1: Readonly<Record<string, PageCast>> = {
  // The ally who was right chalks his orbit where everyone walks through it.
  aristarchus: { kind: "rig", art: "aristarchus-campus", signature: "chalk", home: "p1-agora" },
  // The order walks and stops as one; one of them keeps an eye on the beans.
  "pythagorean-order": {
    kind: "sprite",
    art: "pythagorean-order",
    signature: "count",
    home: "p1-agora",
  },
  "pythagorean-bean": {
    kind: "rig",
    art: "pythagorean-bean",
    signature: "beans",
    home: "p1-agora",
  },
  // Escort helpers: `scared` on the way out, `relief` on arrival.
  "pythagorean-junior": {
    kind: "rig",
    art: "pythagorean-junior",
    signature: "talk",
    home: "p1-agora",
    mark: "pythagorean-junior",
  },
  "lyceum-scribe": {
    kind: "rig",
    art: "lyceum-scribe",
    signature: "talk",
    home: "p1-agora",
    mark: "lyceum-scribe",
  },
  "survey-helper": {
    kind: "rig",
    art: "survey-helper",
    signature: "talk",
    home: "p1-agora",
    mark: "survey-helper",
  },
  // The 아고라 at work.
  "agora-potter": {
    kind: "rig",
    art: "agora-potter",
    signature: "wipe",
    home: "p1-agora",
    mark: "potter",
  },
  "agora-barber": {
    kind: "rig",
    art: "agora-barber",
    signature: "strop",
    home: "p1-agora",
    mark: "barber",
  },
  "agora-customer": { kind: "rig", art: "agora-customer", signature: "flinch", home: "p1-agora" },
  "agora-cook": {
    kind: "rig",
    art: "agora-cook",
    signature: "taste",
    home: "p1-agora",
    mark: "cook",
  },
  "agora-pointer": {
    kind: "rig",
    art: "agora-pointer",
    signature: "shout",
    home: "p1-agora",
    mark: "argument-a",
  },
  "agora-counter": {
    kind: "rig",
    art: "agora-counter",
    signature: "tally",
    home: "p1-agora",
    mark: "argument-b",
  },
  "agora-children": {
    kind: "sprite",
    art: "agora-children",
    signature: "idle",
    home: "p1-agora",
    mark: "children",
  },
  "agora-fishmonger": {
    kind: "rig",
    art: "agora-fishmonger",
    signature: "shout",
    home: "p1-agora",
    mark: "fish-seller",
  },
  "agora-water": { kind: "rig", art: "agora-water", signature: "steady", home: "p1-agora" },
  "agora-sleeper": { kind: "rig", art: "agora-sleeper", signature: "wake", home: "p1-agora" },
  "agora-sophist": { kind: "rig", art: "agora-sophist", signature: "flourish", home: "p1-agora" },
  "agora-messenger": { kind: "rig", art: "agora-messenger", signature: "wave", home: "p1-agora" },
};
