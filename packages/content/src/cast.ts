/**
 * Who each narrative speaker is drawn as (PLAN §3 recurring cast, §16 characters): the art
 * build's walk-around rig or sprite for a speaker id, with the one move that is theirs. One
 * table for the NPCs in the world, the dialogue box and the cutscenes. A speaker missing here
 * has no walk-around art: a voice (the school broadcast, the player), or the era boss, who is
 * drawn by the boss art. Portraits follow the speaker id: `portrait-<speaker>`.
 */
export interface CastArt {
  readonly kind: "rig" | "sprite";
  /** Rig or sprite name in the art build. */
  readonly art: string;
  /** Animation played now and then while they stand; the rest of the time they idle. */
  readonly signature: string;
  /** A sprite drawn with them, anchored at their eyes (the guard's vision cone). */
  readonly cone?: string;
}

export const CAST_ART: Readonly<Record<string, CastArt>> = {
  entropy: { kind: "sprite", art: "entropy", signature: "sleep" },
  sagam: { kind: "rig", art: "sagam", signature: "whistle" },
  mo: { kind: "rig", art: "mo", signature: "sign" },
  principal: { kind: "rig", art: "principal", signature: "announce" },
  nurse: { kind: "rig", art: "nurse", signature: "care" },
  // The interior kit's `cook` is the kitchen prop.
  cook: { kind: "rig", art: "head-cook", signature: "ladle" },
  parent: { kind: "rig", art: "parent", signature: "offer" },
  hyunwoo: { kind: "rig", art: "hyunwoo", signature: "remember" },
  garam: { kind: "rig", art: "garam", signature: "chatter" },
  seoha: { kind: "rig", art: "seoha", signature: "measure" },
  "senior-math": { kind: "rig", art: "senior-math", signature: "aim" },
  "senior-physics": { kind: "rig", art: "senior-physics", signature: "throw" },
  "senior-chem": { kind: "rig", art: "senior-chem", signature: "pour" },
  "senior-bio": { kind: "rig", art: "senior-bio", signature: "divide" },
  "senior-earth": { kind: "rig", art: "senior-earth", signature: "forecast" },
  guard: { kind: "rig", art: "guard", signature: "halt", cone: "guard-cone" },
  pythagoreans: { kind: "rig", art: "pythagorean-campus", signature: "count" },
  zeno: { kind: "rig", art: "zeno-campus", signature: "half" },
  "aristotle-freed": { kind: "rig", art: "aristotle-campus", signature: "jot" },
  aristarchus: { kind: "rig", art: "aristarchus-campus", signature: "squint" },
};
