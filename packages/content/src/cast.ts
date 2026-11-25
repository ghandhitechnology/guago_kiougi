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
  aristarchus: { kind: "rig", art: "aristarchus-campus", signature: "squint", home: "p1-agora" },
};
