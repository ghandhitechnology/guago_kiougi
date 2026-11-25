/**
 * Who each narrative speaker is drawn as (PLAN §3 recurring cast, §16 characters): the art
 * build's walk-around rig or sprite for a speaker id, the one move that is theirs, and where
 * they live. One table for the NPCs in the world, the dialogue box and the cutscenes. A speaker
 * missing here has no walk-around art: a voice (the school broadcast, the player), or the era
 * boss, who is drawn by the boss art. Portraits follow the speaker id: `portrait-<speaker>`.
 */
export interface CastArt {
  readonly kind: "rig" | "sprite";
  /** Rig or sprite name in the art build. */
  readonly art: string;
  /** Animation played now and then while they stand; the rest of the time they idle. */
  readonly signature: string;
  /** A sprite drawn with them, anchored at their eyes (the guard's vision cone). */
  readonly cone?: string;
  /**
   * The place they stand when they are around: a map id or a room zone id. Of the NPC spots the
   * maps give them, the one in this place is theirs; a place not built yet leaves them at the
   * spot their barks name, else the first spot listed.
   */
  readonly home?: string;
  /**
   * The map mark in `home` they work at, for a townsperson whose place is a mark (the potter's
   * wheel, the barber's chair) rather than a speaker's spot. Their NPC spot goes on that mark.
   */
  readonly mark?: string;
}

export const CAST_ART: Readonly<Record<string, CastArt>> = {
  entropy: { kind: "sprite", art: "entropy", signature: "sleep", home: "study-hall" },
  sagam: { kind: "rig", art: "sagam", signature: "whistle", home: "saebyeok" },
  mo: { kind: "rig", art: "mo", signature: "sign", home: "staff-room" },
  principal: { kind: "rig", art: "principal", signature: "announce", home: "staff-room" },
  nurse: { kind: "rig", art: "nurse", signature: "care", home: "infirmary" },
  // The interior kit's `cook` is the kitchen prop.
  cook: { kind: "rig", art: "head-cook", signature: "ladle", home: "cafeteria" },
  parent: { kind: "rig", art: "parent", signature: "offer", home: "home" },
  hyunwoo: { kind: "rig", art: "hyunwoo", signature: "remember", home: "gaseolgwan-2f" },
  garam: { kind: "rig", art: "garam", signature: "chatter", home: "maker-room" },
  seoha: { kind: "rig", art: "seoha", signature: "measure" },
  "senior-math": { kind: "rig", art: "senior-math", signature: "aim", home: "gauss-room" },
  "senior-physics": { kind: "rig", art: "senior-physics", signature: "throw", home: "physics-lab" },
  "senior-chem": { kind: "rig", art: "senior-chem", signature: "pour", home: "chem-lab" },
  "senior-bio": { kind: "rig", art: "senior-bio", signature: "divide", home: "bio-lab" },
  "senior-earth": { kind: "rig", art: "senior-earth", signature: "forecast", home: "study-hall" },
  guard: {
    kind: "rig",
    art: "guard",
    signature: "halt",
    cone: "guard-cone",
    home: "p1-shadow-cave",
  },
  pythagoreans: { kind: "rig", art: "pythagorean-campus", signature: "count", home: "gauss-room" },
  zeno: { kind: "rig", art: "zeno-campus", signature: "half" },
  "aristotle-freed": {
    kind: "rig",
    art: "aristotle-campus",
    signature: "jot",
    home: "question-library",
  },
  aristarchus: { kind: "rig", art: "aristarchus-campus", signature: "chalk", home: "p1-agora" },

  // Page 1's people. Each one's `idle` is their work and loops by itself; the signature is the
  // thing they do now and then. Also in the art: `squint` (아리스타르코스), `beans` (the bean
  // watcher), `scared` and `relief` (the three helpers, on the way out and on arrival), `alert`
  // and `catch` (the guard), `walk` for everyone.
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
  // The stands at 엘레아 and the 리케이온's lecture hall: `spectator-sit-a` to `-c` and
  // `spectator-stand-a`, `-b` (`idle`, `cheer`) to scatter on the tiers, and `crowd-a` to `-c` as
  // walking figures for an audience that faces its speaker.
  "crowd-a": { kind: "rig", art: "crowd-a", signature: "cheer" },
  "crowd-b": { kind: "rig", art: "crowd-b", signature: "cheer" },
  "crowd-c": { kind: "rig", art: "crowd-c", signature: "cheer" },
};
