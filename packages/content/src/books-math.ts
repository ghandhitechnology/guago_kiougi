import type {
  BeamAttack,
  DashAttack,
  OrbitAttack,
  ProjectileAttack,
  WaveAttack,
} from "./attacks.ts";
import { book } from "./book-def.ts";

/** Sides grow 3 → 8 with level; the evolution closes the polygon into a ring. */
export const WANGDO = book<OrbitAttack>({
  id: "wangdo",
  subject: "math",
  tool: "compass",
  attack: {
    kind: "orbit",
    cooldown: 3,
    damage: 0.8,
    knock: 40,
    count: 3,
    orbitRadius: 28,
    bodyRadius: 5,
    period: 1.2,
    duration: 2,
    hitInterval: 0.5,
  },
  levels: [
    { at: 10, add: { count: 1 } },
    { at: 25, add: { count: 1, orbitRadius: 4 } },
    { at: 45, add: { count: 1 } },
    { at: 70, add: { count: 1, orbitRadius: 4 } },
    { at: 100, add: { count: 1, duration: 1 } },
  ],
  cues: { body: "atk-polygon", hit: "fx-spark" },
  evolution: {
    id: "elements",
    attack: {
      kind: "wave",
      cooldown: 2,
      damage: 2.4,
      knock: 120,
      radius: 96,
      speed: 200,
      width: 16,
      hold: 0,
      pull: 0,
    } satisfies WaveAttack,
    levels: [],
    cues: { body: "atk-ring" },
  },
});

export const GRAPH_NOTE = book<BeamAttack>({
  id: "graph-note",
  subject: "math",
  tool: "grid-ruler",
  attack: {
    kind: "beam",
    cooldown: 2,
    damage: 2.4,
    knock: 20,
    length: 160,
    width: 10,
    duration: 0.4,
    amplitude: 12,
    wavelength: 48,
    reflect: 0,
  },
  levels: [
    { at: 15, add: { length: 32 } },
    { at: 40, add: { width: 4, amplitude: 4 } },
    { at: 70, add: { damage: 0.4 } },
  ],
  cues: { body: "atk-sine", hit: "fx-spark" },
  evolution: {
    id: "fourier",
    attack: {
      kind: "beam",
      cooldown: 2,
      damage: 1.6,
      knock: 30,
      length: 224,
      width: 14,
      duration: 0.5,
      amplitude: 16,
      wavelength: 24,
      reflect: 0,
      count: 3,
      spread: 0,
    } satisfies BeamAttack,
    levels: [],
    cues: { body: "atk-sine-stack" },
  },
});

/** Volleys of 1, 1, 2, 3, 5, 8 shots on consecutive casts, then back to 1. */
export const SEQUENCE = book<ProjectileAttack>({
  id: "sequence",
  subject: "math",
  tool: "calculator",
  attack: {
    kind: "projectile",
    cooldown: 0.8,
    damage: 0.6,
    knock: 15,
    count: 1,
    spread: 24,
    speed: 220,
    gravity: 0,
    range: 180,
    radius: 3,
    impactRadius: 0,
    pierce: 0,
    bounce: 0,
    burst: [1, 1, 2, 3, 5, 8],
  },
  levels: [
    { at: 20, add: { pierce: 1 } },
    { at: 50, add: { damage: 0.1 } },
    { at: 80, add: { pierce: 1 } },
  ],
  cues: { body: "atk-digit", hit: "fx-spark" },
  evolution: {
    id: "divergent",
    attack: {
      kind: "projectile",
      cooldown: 0.7,
      damage: 0.7,
      knock: 15,
      count: 1,
      spread: 36,
      speed: 240,
      gravity: 0,
      range: 200,
      radius: 3,
      impactRadius: 0,
      pierce: 2,
      bounce: 0,
      burst: [1, 1, 2, 3, 5, 8, 13, 21],
      specials: [{ kind: "keepBurst" }],
    } satisfies ProjectileAttack,
    levels: [],
  },
});

/** A die per hit, ×1 to ×6: 3.5 on average. */
export const PROBABILITY = book<ProjectileAttack>({
  id: "probability",
  subject: "math",
  tool: "dice",
  attack: {
    kind: "projectile",
    cooldown: 1.2,
    damage: 0.55,
    knock: 30,
    count: 1,
    spread: 0,
    speed: 160,
    gravity: 300,
    range: 140,
    radius: 4,
    impactRadius: 16,
    pierce: 0,
    bounce: 1,
    specials: [{ kind: "roll", min: 1, max: 6, rising: false }],
  },
  levels: [
    { at: 25, add: { count: 1 } },
    { at: 60, add: { impactRadius: 4 } },
    { at: 90, add: { count: 1 } },
  ],
  cues: { body: "atk-die", hit: "fx-thud" },
  evolution: {
    id: "expectation",
    attack: {
      kind: "projectile",
      cooldown: 1,
      damage: 0.55,
      knock: 30,
      count: 3,
      spread: 30,
      speed: 160,
      gravity: 300,
      range: 160,
      radius: 4,
      impactRadius: 20,
      pierce: 0,
      bounce: 1,
      specials: [{ kind: "roll", min: 1, max: 6, rising: true }],
    } satisfies ProjectileAttack,
    levels: [],
  },
});

/** Blink to the aimed point; the axes stay behind and burn what stands on them. */
export const COORDINATE = book<DashAttack>({
  id: "coordinate",
  subject: "math",
  tool: "set-square",
  attack: {
    kind: "dash",
    cooldown: 3.5,
    damage: 1,
    knock: 60,
    distance: 64,
    duration: 0,
    width: 12,
    carry: false,
    specials: [
      { kind: "trail", trail: { radius: 32, duration: 2, tickInterval: 0.5, damage: 0.4 } },
    ],
  },
  levels: [
    { at: 30, add: { distance: 16 } },
    { at: 65, add: { damage: 0.4 } },
  ],
  cues: { body: "atk-axes", hit: "fx-spark", area: "fx-axes" },
  evolution: {
    id: "linear-map",
    attack: {
      kind: "dash",
      cooldown: 3,
      damage: 1.6,
      knock: 80,
      distance: 96,
      duration: 0,
      width: 16,
      carry: false,
      specials: [
        {
          kind: "trail",
          trail: { radius: 56, duration: 3, tickInterval: 0.5, damage: 0.6, spin: 60 },
        },
      ],
    } satisfies DashAttack,
    levels: [],
  },
});

/** No shape of its own: a longer 증명 스택 and a heavier Q.E.D. paid from this book's damage. */
export const PROOF_NOTE = book<OrbitAttack>({
  id: "proof-note",
  subject: "math",
  tool: "red-pen",
  attack: null,
  levels: [],
  signature: { proofCap: 5, qedDamage: 4, qedChain: 0 },
  cues: { body: "fx-qed", hit: "fx-qed" },
  evolution: {
    id: "complete-proof",
    attack: null,
    levels: [],
    signature: { proofCap: 5, qedDamage: 6, qedChain: 3 },
  },
});

export const MATH_BOOKS = [WANGDO, GRAPH_NOTE, SEQUENCE, PROBABILITY, COORDINATE, PROOF_NOTE];
