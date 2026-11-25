import { Rank } from "@guago/shared";
import type { TextKey } from "./narrative/schema.ts";
import { termKey } from "./narrative/study.ts";
import type { StatusId } from "./statuses.ts";

/**
 * Monster behaviours: the eight archetypes of PLAN §6, plus the Page 1 unique `zeno`. Each Page
 * reskins the archetypes with new numbers and sprites. Distances in px, times in seconds,
 * `damage` multiplies `monsterDamage(level, rank)`. A player walks at about 72 px/s.
 */
export type Behavior =
  /** 추격형: walks at the nearest player. */
  | { readonly kind: "chaser" }
  /** 돌진형: stops and shows the line for `windup`, then charges along it. */
  | {
      readonly kind: "charger";
      readonly trigger: number;
      readonly windup: number;
      readonly speed: number;
      readonly distance: number;
      readonly recover: number;
      readonly cooldown: number;
      readonly damage: number;
    }
  /** 원거리형: holds between `keepMin` and `keepMax` and fires slow shots. */
  | {
      readonly kind: "ranged";
      readonly keepMin: number;
      readonly keepMax: number;
      readonly interval: number;
      readonly windup: number;
      readonly projectileSpeed: number;
      readonly projectileRadius: number;
      readonly projectileRange: number;
      readonly damage: number;
      readonly projectile: string;
    }
  /** 분열형: on death becomes `count` of `into`, which do not split again. */
  | { readonly kind: "splitter"; readonly into: string; readonly count: number }
  /** 방패형: hits from inside the front arc lose `reduction`; it turns slowly to face its target. */
  | {
      readonly kind: "shielded";
      readonly arc: number;
      readonly reduction: number;
      readonly turnRate: number;
    }
  /** 자폭형: rushes in, arms within `armRange`, explodes after `fuse` even if killed meanwhile. */
  | {
      readonly kind: "bomber";
      readonly rushRange: number;
      readonly rushSpeed: number;
      readonly armRange: number;
      readonly fuse: number;
      readonly radius: number;
      readonly damage: number;
      /** Share of the blast monsters caught in it take, as a share of their own max HP. */
      readonly monsterShare: number;
    }
  /** 치유형: stays behind the pack and heals monsters near it. Auto-aim treats it as closer. */
  | {
      readonly kind: "healer";
      readonly range: number;
      readonly interval: number;
      /** Share of each target's max HP. */
      readonly heal: number;
      readonly keepMin: number;
      readonly aimPriority: number;
    }
  /** 군집형: arrives in packs, weak and fast. */
  | { readonly kind: "swarm"; readonly packMin: number; readonly packMax: number }
  /**
   * 제논의 거북이 (Page 1 unique): it flees, and no hit can take more than half of what it has
   * left, until the halving converges below `1 / 2^halvings` of its health and it falls. Eleven
   * hits from anyone, however strong. It escapes after `escapeAfter` seconds.
   */
  | {
      readonly kind: "zeno";
      readonly fleeSpeed: number;
      readonly halvings: number;
      readonly escapeAfter: number;
    };

export type ArchetypeId = Exclude<Behavior["kind"], "zeno">;

export const ARCHETYPE_NAMES: Readonly<Record<ArchetypeId, string>> = {
  chaser: "추격형",
  charger: "돌진형",
  ranged: "원거리형",
  splitter: "분열형",
  shielded: "방패형",
  bomber: "자폭형",
  healer: "치유형",
  swarm: "군집형",
};

/** Seconds between two contact hits from the same monster on the same player. */
export const CONTACT_INTERVAL = 1;

export interface MonsterCues {
  readonly hit: string;
  readonly die: string;
  /** Charge, shot, fuse or heal. */
  readonly attack?: string;
  /** The archetype's effect sprite: projectile, blast, heal ring, charge dust. */
  readonly fx?: string;
}

export interface MonsterDef {
  readonly id: string;
  readonly name: TextKey;
  readonly sprite: string;
  readonly behavior: Behavior;
  readonly mass: number;
  /** px/s. */
  readonly speed: number;
  /** Collider in px. */
  readonly radius: number;
  /** Multiplies `monsterHP`, `monsterDamage`, `monsterEXP` and `monsterCoin`. */
  readonly hp: number;
  readonly damage: number;
  readonly exp: number;
  readonly coin: number;
  readonly armor: number;
  /** Statuses it always carries; never consumed. */
  readonly innate: readonly StatusId[];
  readonly immune: readonly StatusId[];
  /** Page 1 unique 그림자: auto-aim ignores it beyond this; manual aim can still hit. */
  readonly autoAimRange?: number;
  readonly cues: MonsterCues;
}

function cues(id: string, fx?: string, attack?: boolean): MonsterCues {
  return {
    hit: `sfx.monster.${id}.hit`,
    die: `sfx.monster.${id}.die`,
    ...(attack ? { attack: `sfx.monster.${id}.attack` } : {}),
    ...(fx ? { fx } : {}),
  };
}

const PLAIN = { armor: 0, innate: [], immune: [] } as const;

/**
 * Page 1 roster. EXP and coin follow HP for the weak and the tanky so no monster is a better
 * farm than another of its level; the tortoise is the exception on purpose.
 */
export const MONSTERS: readonly MonsterDef[] = [
  {
    id: "odap",
    name: termKey("monster", "odap"),
    sprite: "odap",
    behavior: { kind: "chaser" },
    mass: 1,
    speed: 34,
    radius: 6,
    hp: 1,
    damage: 1,
    exp: 1,
    coin: 1,
    ...PLAIN,
    cues: cues("odap"),
  },
  {
    id: "odap-pencil",
    name: termKey("monster", "odap-pencil"),
    sprite: "odap-pencil",
    behavior: { kind: "swarm", packMin: 6, packMax: 9 },
    mass: 0.4,
    speed: 52,
    radius: 5,
    hp: 0.3,
    damage: 0.4,
    exp: 0.3,
    coin: 0.3,
    ...PLAIN,
    cues: cues("odap-pencil"),
  },
  {
    id: "rational",
    name: termKey("monster", "rational"),
    sprite: "rational",
    behavior: { kind: "shielded", arc: 120, reduction: 0.8, turnRate: 120 },
    mass: 2.5,
    speed: 26,
    radius: 7,
    hp: 1.8,
    damage: 1.2,
    exp: 1.6,
    coin: 1.6,
    armor: 0,
    innate: ["metal"],
    immune: [],
    cues: cues("rational", "fx-shield-block"),
  },
  {
    id: "element-fire",
    name: termKey("monster", "element-fire"),
    sprite: "element-fire",
    behavior: {
      kind: "bomber",
      rushRange: 96,
      rushSpeed: 64,
      armRange: 20,
      fuse: 0.8,
      radius: 32,
      damage: 3,
      monsterShare: 0.5,
    },
    mass: 0.8,
    speed: 40,
    radius: 6,
    hp: 0.7,
    damage: 1,
    exp: 0.9,
    coin: 0.9,
    armor: 0,
    innate: [],
    immune: ["burn", "flammable"],
    cues: cues("element-fire", "fx-burst", true),
  },
  {
    id: "element-water",
    name: termKey("monster", "element-water"),
    sprite: "element-water",
    behavior: { kind: "healer", range: 64, interval: 3, heal: 0.08, keepMin: 96, aimPriority: 2 },
    mass: 1,
    speed: 30,
    radius: 6,
    hp: 0.9,
    damage: 0.6,
    exp: 1.1,
    coin: 1.1,
    armor: 0,
    innate: ["wet"],
    immune: [],
    cues: cues("element-water", "fx-heal", true),
  },
  {
    id: "element-air",
    name: termKey("monster", "element-air"),
    sprite: "element-air",
    behavior: {
      kind: "charger",
      trigger: 96,
      windup: 0.6,
      speed: 220,
      distance: 112,
      recover: 0.8,
      cooldown: 4,
      damage: 1.5,
    },
    mass: 0.5,
    speed: 36,
    radius: 6,
    hp: 0.8,
    damage: 1,
    exp: 1,
    coin: 1,
    ...PLAIN,
    cues: cues("element-air", "fx-dust", true),
  },
  {
    id: "element-earth",
    name: termKey("monster", "element-earth"),
    sprite: "element-earth",
    behavior: { kind: "splitter", into: "element-earth-pebble", count: 2 },
    mass: 3,
    speed: 24,
    radius: 7,
    hp: 1.4,
    damage: 1.2,
    exp: 1.2,
    coin: 1.2,
    ...PLAIN,
    cues: cues("element-earth", "fx-shard"),
  },
  {
    id: "element-earth-pebble",
    name: termKey("monster", "element-earth-pebble"),
    sprite: "element-earth-pebble",
    behavior: { kind: "chaser" },
    mass: 1,
    speed: 40,
    radius: 4,
    hp: 0.4,
    damage: 0.5,
    exp: 0.3,
    coin: 0.3,
    ...PLAIN,
    cues: cues("element-earth-pebble"),
  },
  {
    id: "cave-shadow",
    name: termKey("monster", "cave-shadow"),
    sprite: "cave-shadow",
    behavior: {
      kind: "ranged",
      keepMin: 72,
      keepMax: 128,
      interval: 2.5,
      windup: 0.4,
      projectileSpeed: 70,
      projectileRadius: 3,
      projectileRange: 200,
      damage: 0.9,
      projectile: "proj-shadow",
    },
    mass: 0.6,
    speed: 30,
    radius: 6,
    hp: 0.8,
    damage: 0.6,
    exp: 1,
    coin: 1,
    ...PLAIN,
    autoAimRange: 80,
    cues: cues("cave-shadow", "proj-shadow", true),
  },
  {
    id: "tortoise",
    name: termKey("monster", "tortoise"),
    sprite: "tortoise",
    behavior: { kind: "zeno", fleeSpeed: 40, halvings: 10, escapeAfter: 30 },
    mass: 4,
    speed: 40,
    radius: 8,
    hp: 3,
    damage: 0,
    exp: 4,
    coin: 6,
    ...PLAIN,
    cues: cues("tortoise"),
  },
];

export function monsterById(id: string): MonsterDef {
  const found = MONSTERS.find((m) => m.id === id);
  if (!found) throw new Error(`unknown monster ${id}`);
  return found;
}

/** Damage a hit actually removes from the tortoise. */
export function zenoDamage(remaining: number, maxHp: number, damage: number, halvings: number) {
  if (remaining <= maxHp / 2 ** halvings) return remaining;
  return Math.min(damage, remaining / 2);
}

/**
 * Every 200 kills in a field an elite of a random roster monster spawns near the busiest cell:
 * rank 12, a 심화 prefix, heavier, a little faster, some armour and an aura.
 */
export const ELITE = {
  everyKills: 200,
  rank: Rank.Elite,
  prefix: termKey("label", "elite"),
  massMult: 3,
  speedMult: 1.15,
  armor: 0.2,
  /** Drawn at ×2 (`<sprite>-elite`), so it collides at ×2 as well: what it visibly touches, it hits. */
  scale: 2,
  aura: "fx-elite-aura",
  spawnCue: "sfx.monster.elite.spawn",
  /** Never promoted. */
  exclude: ["tortoise", "element-earth-pebble"],
} as const;

export interface BossDef {
  readonly id: string;
  readonly name: TextKey;
  readonly sprite: string;
  readonly rank: number;
  readonly level: number;
  readonly mass: number;
  readonly speed: number;
  readonly radius: number;
  readonly armor: number;
  /** Contact damage multiplier. */
  readonly damage: number;
  readonly slam: {
    readonly every: number;
    /** The circle shows on the ground for this long before it lands. */
    readonly windup: number;
    readonly radius: number;
    readonly damage: number;
    readonly knock: number;
  };
  /** Below `below` of its health, each slam is followed by a wider one. */
  readonly enrage: {
    readonly below: number;
    readonly delay: number;
    readonly radiusMult: number;
  };
  readonly summon: {
    readonly every: number;
    readonly monster: string;
    readonly count: number;
    readonly cap: number;
  };
  readonly cues: {
    readonly telegraph: string;
    readonly shockwave: string;
    readonly slam: string;
    readonly roar: string;
    readonly die: string;
  };
}

/**
 * Tutorial mini-boss of the opening (PLAN §4 beat 5). At level 5 the slam deals about a third of
 * a new player's HP, so two mistakes are survivable and the third is a lesson in dodging.
 */
export const ODAP_GOLEM: BossDef = {
  id: "odap-golem",
  name: termKey("monster", "odap-golem"),
  sprite: "golem",
  rank: Rank.TutorialBoss,
  level: 5,
  mass: 20,
  speed: 22,
  radius: 14,
  armor: 0.2,
  damage: 0.5,
  slam: { every: 5, windup: 1, radius: 56, damage: 1, knock: 220 },
  enrage: { below: 0.5, delay: 0.6, radiusMult: 1.4 },
  summon: { every: 10, monster: "odap", count: 3, cap: 9 },
  cues: {
    telegraph: "tele-circle",
    shockwave: "fx-shockwave",
    slam: "sfx.boss.odap-golem.slam",
    roar: "sfx.boss.odap-golem.roar",
    die: "sfx.boss.odap-golem.die",
  },
};
