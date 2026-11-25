import { Rank } from "@guago/shared";
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
  readonly name: string;
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
  /** What it says when it shows up in a cutscene or the 도감. One register per speaker. */
  readonly line: string;
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
    name: "오답",
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
    line: "내가 틀렸다고? 채점이 틀렸겠지.",
    cues: cues("odap"),
  },
  {
    id: "odap-pencil",
    name: "연필 오답",
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
    line: "지우개만… 지우개만 안 오면 돼…",
    cues: cues("odap-pencil"),
  },
  {
    id: "rational",
    name: "유리수 병사",
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
    line: "만물은 정수의 비입니다! 루트 2 같은 건 존재하지 않습니다!",
    cues: cues("rational", "fx-shield-block"),
  },
  {
    id: "element-fire",
    name: "불의 정령",
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
    line: "불이야말로 가장 순수한 원소다. 위로 올라가는 게 그 증거지.",
    cues: cues("element-fire", "fx-burst", true),
  },
  {
    id: "element-water",
    name: "물의 정령",
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
    line: "모든 것은 물에서 왔다. 너도 좀 축여 주지.",
    cues: cues("element-water", "fx-heal", true),
  },
  {
    id: "element-air",
    name: "공기의 정령",
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
    line: "공기가 가볍다고? 맞아 보면 생각이 바뀔걸.",
    cues: cues("element-air", "fx-dust", true),
  },
  {
    id: "element-earth",
    name: "흙의 정령",
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
    line: "흙은 제자리로 돌아간다. 너도 네 자리로 돌아가라.",
    cues: cues("element-earth", "fx-rubble"),
  },
  {
    id: "element-earth-pebble",
    name: "흙의 정령 조각",
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
    line: "아직 제자리가 아니다.",
    cues: cues("element-earth-pebble"),
  },
  {
    id: "cave-shadow",
    name: "동굴의 그림자",
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
    line: "우리가 진짜다. 뒤를 돌아보지 마라.",
    cues: cues("cave-shadow", "proj-shadow", true),
  },
  {
    id: "tortoise",
    name: "제논의 거북이",
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
    line: "서두를 것 없네. 자네는 결코 나를 따라잡지 못할 걸세.",
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
  prefix: "심화",
  massMult: 3,
  speedMult: 1.15,
  armor: 0.2,
  aura: "fx-elite",
  spawnCue: "sfx.monster.elite.spawn",
  /** Never promoted. */
  exclude: ["tortoise", "element-earth-pebble"],
} as const;

export interface BossDef {
  readonly id: string;
  readonly name: string;
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
  readonly lines: { readonly intro: string; readonly enrage: string; readonly defeat: string };
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
  name: "오답노트 골렘",
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
  lines: {
    intro: "잠깐, 이것도 적어 둬야지. 틀렸으니까.",
    enrage: "틀린 건 전부 적어 뒀어. 다시 틀리려고!",
    defeat: "오답노트는… 원래… 다시 보라고 있는 건데…",
  },
  cues: {
    telegraph: "fx-telegraph-circle",
    shockwave: "fx-shockwave",
    slam: "sfx.boss.odap-golem.slam",
    roar: "sfx.boss.odap-golem.roar",
    die: "sfx.boss.odap-golem.die",
  },
};
