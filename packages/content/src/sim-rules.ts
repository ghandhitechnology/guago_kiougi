import {
  type AreaRule,
  Behavior,
  type BookGrade,
  bookDamage,
  type FieldRule,
  Kind,
  MAJORS,
  type MonsterKind,
  type Pacing,
  PickupKind,
  PLAYER_SPEED,
  type PlayerBuild,
  type PlayerKit,
  playerHP,
  ReactionKind,
  type ReactionRule,
  type SimDrop,
  type SimRules,
  SPEED_CAP,
  StatusOrder,
  type StatusPick,
  type StatusRule,
  statEffects,
  TICK_RATE_HZ,
  ticks,
  type Weapon,
} from "@guago/shared";
import {
  type Attack,
  type AttackContext,
  resolveAttack,
  type StatusApply,
  type ToolDef,
  type Trail,
  toolPassives,
} from "./attacks.ts";
import { BOOKS, type BookDef, TOOLS, toolById } from "./books.ts";
import {
  type ClassId,
  forecast,
  MOMENTUM,
  momentumCollisionShare,
  momentumDamage,
  PROLIFERATION,
  PROOF,
  proliferation,
  qedDamage,
  REACTIONS,
  signatureStrength,
} from "./classes.ts";
import { DROPS, type RankName, rollDrops } from "./drops.ts";
import {
  FIELD_PACING,
  type FieldDef,
  fieldPopulation,
  refillCap,
  regionCount,
  regionLevels,
  spawnLevel,
} from "./fields.ts";
import { AUTO_PLAY, MODES } from "./modes.ts";
import {
  CONTACT_INTERVAL,
  ELITE,
  MONSTERS,
  type MonsterDef,
  ODAP_GOLEM,
  zenoDamage,
} from "./monsters.ts";
import { SLOW_RESIST, STATUS_IDS, STATUSES, type StatusId } from "./statuses.ts";

/**
 * Content compiled for the combat step in `@guago/shared` (`SimRules`): seconds become ticks,
 * px/s become px per tick, degrees become radians, ids become indices. The step reads only these
 * numbers; every rule still lives here, once.
 */

const T = TICK_RATE_HZ;
const DEG = Math.PI / 180;
const perTick = (v: number) => v / T;
const tickCount = (s: number) => Math.max(0, Math.round(s * T));

const statusIndex = new Map<StatusId, number>(STATUS_IDS.map((id, i) => [id, i]));
const index = (id: StatusId) => statusIndex.get(id) as number;

function pickOf(s: StatusApply): StatusPick {
  return { status: index(s.id), stacks: s.stacks, chance: s.chance, self: s.self ?? false };
}

function maskOf(ids: readonly StatusId[]): number {
  let mask = 0;
  for (const id of ids) mask |= 1 << index(id);
  return mask;
}

const KINDS = {
  orbit: Kind.Orbit,
  beam: Kind.Beam,
  projectile: Kind.Projectile,
  chain: Kind.Chain,
  cone: Kind.Cone,
  summon: Kind.Summon,
  telegraph: Kind.Telegraph,
  wave: Kind.Wave,
  zone: Kind.Zone,
  dash: Kind.Dash,
} as const;

function trailOf(t: Trail): AreaRule {
  return {
    radius: t.radius,
    duration: tickCount(t.duration),
    interval: Math.max(1, tickCount(t.tickInterval)),
    damage: t.damage,
    status: t.status ? pickOf(t.status) : null,
    pull: t.pull ?? 0,
    spin: perTick((t.spin ?? 0) * DEG),
  };
}

/** One resolved attack as the step's flat weapon. */
function weaponOf(
  book: number,
  evolved: boolean,
  hit: number,
  a: Attack,
  baseDelay: number,
  mods: Record<string, number>,
  earth: number,
): Weapon {
  const n = a as unknown as Record<string, number | boolean | string | undefined | unknown>;
  const num = (k: string) => (typeof n[k] === "number" ? (n[k] as number) : 0);
  const statuses = a.status === undefined ? [] : Array.isArray(a.status) ? a.status : [a.status];
  const specials = a.specials ?? [];
  const special = <K extends string>(kind: K) =>
    specials.find((s) => s.kind === kind) as
      | Extract<(typeof specials)[number], { kind: K }>
      | undefined;
  const roll = special("roll");
  const trail = special("trail");
  const grow = special("grow");
  const critOn = special("critOn");
  const spread = special("spread");
  const neutralize = special("neutralize");
  const heal = special("healOnKill");
  const fc = a.kind === "telegraph" ? forecast(baseDelay, earth) : { damage: 1, area: 1 };
  const poolDuration = num("poolDuration");
  const pool: AreaRule | null =
    a.kind === "projectile" && poolDuration > 0
      ? {
          radius: num("poolRadius"),
          duration: tickCount(poolDuration),
          interval: Math.max(1, tickCount(num("poolTickInterval"))),
          damage: num("poolDamage"),
          status: a.poolStatus ? pickOf(a.poolStatus) : null,
          pull: 0,
          spin: 0,
        }
      : null;
  const zone = a.kind === "zone" ? a : null;
  return {
    book,
    evolved,
    kind: KINDS[a.kind],
    cooldown: a.cooldown * T,
    hit,
    knock: a.knock,
    statuses: statuses.map(pickOf),
    statusOrder:
      a.statusOrder === "random"
        ? StatusOrder.Random
        : a.statusOrder === "choose"
          ? StatusOrder.Choose
          : StatusOrder.Cycle,
    followDelay: a.followUp ? Math.max(1, tickCount(a.followUp.delay)) : 0,
    followDamage: a.followUp?.damage ?? 0,
    followStatus: a.followUp?.status ? pickOf(a.followUp.status) : null,
    count: num("count"),
    orbitRadius: num("orbitRadius"),
    bodyRadius: num("bodyRadius"),
    period: num("period") * T,
    duration: tickCount(num("duration")),
    hitInterval: Math.max(
      1,
      tickCount(a.kind === "zone" ? num("tickInterval") : num("hitInterval")),
    ),
    sweep: num("sweep") * DEG,
    precession: perTick(num("precession") * DEG),
    length: num("length"),
    width: num("width"),
    amplitude: num("amplitude"),
    wavelength: num("wavelength"),
    reflect: num("reflect"),
    spread: a.kind === "beam" || a.kind === "projectile" ? num("spread") * DEG : 0,
    speed: perTick(num("speed")),
    gravity: num("gravity") / (T * T),
    range: num("range"),
    radius: num("radius"),
    impactRadius: num("impactRadius"),
    pierce: num("pierce"),
    bounce: num("bounce"),
    burst: a.kind === "projectile" ? (a.burst ?? []) : [],
    pool,
    jumps: num("jumps"),
    jumpRange: num("jumpRange"),
    falloff: a.kind === "chain" ? a.falloff : 1,
    angle: num("angle") * DEG,
    hits: num("hits"),
    perCast: num("perCast"),
    cap: num("cap"),
    lifetime: tickCount(num("lifetime")),
    divideEvery: tickCount(num("divideEvery")),
    line: a.kind === "telegraph" && a.shape === "line",
    delay: tickCount(num("delay")),
    repeat: num("repeat"),
    repeatInterval: tickCount(num("repeatInterval")),
    scatter: num("scatter"),
    hold: tickCount(num("hold")),
    pull: num("pull"),
    follow: zone?.follow ?? false,
    growth: perTick(num("growth")),
    allies: zone?.affects === "allies",
    buffAttackSpeed: zone?.buff?.attackSpeed ?? 0,
    buffCooldown: zone?.buff?.cooldown ?? 0,
    distance: num("distance"),
    carry: a.kind === "dash" ? a.carry : false,
    rollMin: roll?.min ?? 1,
    rollMax: roll?.max ?? 0,
    rollRising: roll?.rising ?? false,
    keepBurst: special("keepBurst") !== undefined,
    trail: trail ? trailOf(trail.trail) : null,
    growPerHit: grow?.perHit ?? 0,
    growMax: grow?.max ?? 0,
    growWindow: grow ? tickCount(grow.window) : 0,
    block: special("block") !== undefined,
    healOnKill: (heal?.share ?? 0) * (mods.healing ?? 1),
    elastic: special("elastic") !== undefined,
    party: special("party") !== undefined,
    critOnStatus: critOn ? index(critOn.status) : -1,
    critOnStacks: critOn?.stacks ?? 0,
    spreadStatus: spread ? index(spread.status) : -1,
    spreadCount: (spread?.count ?? 0) + (spread ? (mods.spread ?? 0) : 0),
    spreadKeep: spread?.keep ?? false,
    specialize: special("specialize") !== undefined,
    fork: special("fork")?.count ?? 0,
    merge: special("merge") !== undefined,
    ricochet: special("ricochet")?.count ?? 0,
    neutralizeShield: neutralize?.hpShare ?? 0,
    neutralizeHeal: (neutralize?.heal ?? 0) * (mods.healing ?? 1),
    statusDuration: mods.statusDuration ?? 1,
    burn: mods.burn ?? 1,
    bleed: mods.bleed ?? 1,
    shield: mods.shield ?? 1,
    aura: mods.aura ?? 1,
    healing: mods.healing ?? 1,
    forecastDamage: 1 + (fc.damage - 1) * (mods.forecast ?? 1),
    forecastArea: fc.area,
  };
}

const bookIndex = new Map(BOOKS.map((b, i) => [b.id, i]));

/**
 * A player's kit: every equipped book resolved at its level with the equipped tools and the
 * player's stats (content `resolveAttack`, `statEffects`, `toolPassives`), plus the class
 * signatures at 전공 or 부전공 strength.
 */
export function compileKit(build: PlayerBuild): PlayerKit {
  const major = build.major as ClassId;
  const minor = (build.minor ?? undefined) as ClassId | undefined;
  const fx = statEffects(build.stats);
  const tools: { def: ToolDef; level: number }[] = build.tools.map((t) => ({
    def: toolById(t.def),
    level: t.level,
  }));
  const passive = toolPassives(tools);
  const ctxBase = { tools, cooldownMult: fx.cooldownMult, durationMult: fx.durationMult };
  const strength = Object.fromEntries(
    MAJORS.map((c) => [c, signatureStrength(c, major, minor)]),
  ) as Record<ClassId, number>;
  const weapons: Weapon[] = [];
  let proofCap: number = PROOF.maxStacks;
  let qedBonus = 0;
  let qedChain = 0;
  for (const b of build.books) {
    const def: BookDef = BOOKS[bookIndex.get(b.def) ?? -1] as BookDef;
    if (!def) continue;
    const form = b.evolved ? def.evolution : def;
    const own = bookDamage(def.base, b.level, b.grade as BookGrade, b.pilgi);
    const signature = form.signature;
    if (signature && def.subject === "math" && strength.math > 0) {
      proofCap += signature.proofCap;
      qedBonus += signature.qedDamage * own;
      qedChain = Math.max(qedChain, signature.qedChain);
    }
    if (!form.attack) continue;
    const ctx: AttackContext = { bookLevel: b.level, ...ctxBase };
    const r = resolveAttack(form.attack, form.levels as never, ctx);
    weapons.push(
      weaponOf(
        bookIndex.get(def.id) as number,
        b.evolved,
        own * r.attack.damage,
        r.attack,
        r.baseDelay,
        r.mods as unknown as Record<string, number>,
        strength.earth,
      ),
    );
  }
  const bio = proliferation(strength.biology);
  return {
    major,
    weapons,
    maxHp: playerHP(build.level, build.stats.vitality),
    regen: fx.regenPerSecond / T,
    critChance: Math.min(0.95, fx.critChance + passive.critChance),
    critMult: fx.critMult + passive.critDamage,
    speed: PLAYER_SPEED * Math.min(SPEED_CAP, fx.speedMult + passive.moveSpeed),
    dodgeCooldown: ticks(fx.dodgeCooldown),
    understanding: build.stats.understanding,
    dropMult: fx.dropMult * (1 + passive.luck),
    coinMult: fx.coinMult * (1 + passive.luck),
    strength: {
      math: strength.math,
      physics: strength.physics,
      chemistry: strength.chemistry,
      biology: strength.biology,
      earth: strength.earth,
    },
    proofCap,
    qedBonus,
    qedChain,
    minionCap: bio.minionCap,
    infectChance: bio.infectChance,
    infectSpread: bio.spread,
    infectRange: PROLIFERATION.spreadRange,
    killHeal: bio.healOnKill,
    collisionShare: momentumCollisionShare(strength.physics),
  };
}

const BEHAVIOR = {
  chaser: Behavior.Chaser,
  charger: Behavior.Charger,
  ranged: Behavior.Ranged,
  splitter: Behavior.Splitter,
  shielded: Behavior.Shielded,
  bomber: Behavior.Bomber,
  healer: Behavior.Healer,
  swarm: Behavior.Swarm,
  zeno: Behavior.Zeno,
} as const;

const ZERO_BEHAVIOR = {
  trigger: 0,
  windup: 0,
  chargeSpeed: 0,
  chargeDistance: 0,
  recover: 0,
  cooldown: 0,
  attackDamage: 0,
  keepMin: 0,
  keepMax: 0,
  interval: 0,
  projectileSpeed: 0,
  projectileRadius: 0,
  projectileRange: 0,
  splitInto: -1,
  splitCount: 0,
  arc: 0,
  reduction: 0,
  turnRate: 0,
  rushRange: 0,
  rushSpeed: 0,
  armRange: 0,
  fuse: 0,
  blastRadius: 0,
  monsterShare: 0,
  healRange: 0,
  heal: 0,
  packMin: 0,
  packMax: 0,
  fleeSpeed: 0,
  halvings: 0,
  escapeAfter: 0,
  slamKnock: 0,
  enrageBelow: 0,
  enrageDelay: 0,
  enrageRadius: 1,
  summonEvery: 0,
  summonKind: -1,
  summonCount: 0,
  summonCap: 0,
};

const monsterIndex = new Map<string, number>(MONSTERS.map((m, i) => [m.id, i]));

function monsterKind(m: MonsterDef, i: number): MonsterKind {
  const b = m.behavior;
  const base = {
    ...ZERO_BEHAVIOR,
    index: i,
    id: m.id,
    sprite: m.sprite,
    behavior: BEHAVIOR[b.kind],
    mass: m.mass,
    speed: perTick(m.speed),
    radius: m.radius,
    hp: m.hp,
    damage: m.damage,
    exp: m.exp,
    coin: m.coin,
    armor: m.armor,
    innate: maskOf(m.innate),
    immune: maskOf(m.immune),
    autoAimRange: m.autoAimRange ?? Number.POSITIVE_INFINITY,
    aimPriority: b.kind === "healer" ? b.aimPriority : 1,
    promotable: !(ELITE.exclude as readonly string[]).includes(m.id),
    rank: 0,
    level: 0,
  };
  switch (b.kind) {
    case "charger":
      return {
        ...base,
        trigger: b.trigger,
        windup: tickCount(b.windup),
        chargeSpeed: perTick(b.speed),
        chargeDistance: b.distance,
        recover: tickCount(b.recover),
        cooldown: tickCount(b.cooldown),
        attackDamage: b.damage,
      };
    case "ranged":
      return {
        ...base,
        keepMin: b.keepMin,
        keepMax: b.keepMax,
        interval: tickCount(b.interval),
        windup: tickCount(b.windup),
        projectileSpeed: perTick(b.projectileSpeed),
        projectileRadius: b.projectileRadius,
        projectileRange: b.projectileRange,
        attackDamage: b.damage,
      };
    case "splitter":
      return { ...base, splitInto: monsterIndex.get(b.into) ?? -1, splitCount: b.count };
    case "shielded":
      return {
        ...base,
        arc: (b.arc / 2) * DEG,
        reduction: b.reduction,
        turnRate: perTick(b.turnRate * DEG),
      };
    case "bomber":
      return {
        ...base,
        rushRange: b.rushRange,
        rushSpeed: perTick(b.rushSpeed),
        armRange: b.armRange,
        fuse: tickCount(b.fuse),
        blastRadius: b.radius,
        attackDamage: b.damage,
        monsterShare: b.monsterShare,
      };
    case "healer":
      return {
        ...base,
        healRange: b.range,
        interval: tickCount(b.interval),
        heal: b.heal,
        keepMin: b.keepMin,
      };
    case "swarm":
      return { ...base, packMin: b.packMin, packMax: b.packMax };
    case "zeno":
      return {
        ...base,
        fleeSpeed: perTick(b.fleeSpeed),
        halvings: b.halvings,
        escapeAfter: tickCount(b.escapeAfter),
      };
    default:
      return base;
  }
}

function golemKind(i: number): MonsterKind {
  const g = ODAP_GOLEM;
  return {
    ...ZERO_BEHAVIOR,
    index: i,
    id: g.id,
    sprite: g.sprite,
    behavior: Behavior.Golem,
    mass: g.mass,
    speed: perTick(g.speed),
    radius: g.radius,
    hp: 1,
    damage: g.damage,
    exp: 1,
    coin: 1,
    armor: g.armor,
    innate: 0,
    immune: 0,
    autoAimRange: Number.POSITIVE_INFINITY,
    aimPriority: 1,
    promotable: false,
    rank: g.rank,
    level: g.level,
    cooldown: tickCount(g.slam.every),
    windup: tickCount(g.slam.windup),
    blastRadius: g.slam.radius,
    attackDamage: g.slam.damage,
    slamKnock: g.slam.knock,
    enrageBelow: g.enrage.below,
    enrageDelay: tickCount(g.enrage.delay),
    enrageRadius: g.enrage.radiusMult,
    summonEvery: tickCount(g.summon.every),
    summonKind: monsterIndex.get(g.summon.monster) ?? -1,
    summonCount: g.summon.count,
    summonCap: g.summon.cap,
  };
}

function statusRule(id: StatusId): StatusRule {
  const s = STATUSES[id];
  return {
    id,
    onPlayer: s.on === "player",
    duration: tickCount(s.duration),
    maxStacks: s.maxStacks,
    dot: s.dot ?? 0,
    slow: s.slow ?? 0,
    damageTaken: s.damageTaken ?? 0,
    armorLoss: s.armorLoss ?? 0,
    shield: s.shield ?? 0,
  };
}

function reactionRules(): { list: ReactionRule[]; table: Int8Array } {
  const n = STATUS_IDS.length;
  const table = new Int8Array(n * n).fill(-1);
  const list = REACTIONS.map((r, i): ReactionRule => {
    const a = index(r.from[0]);
    const b = index(r.from[1]);
    table[a * n + b] = i;
    table[b * n + a] = i;
    const e = r.effect;
    return {
      index: i,
      a,
      b,
      kind:
        e.kind === "shield"
          ? ReactionKind.Shield
          : e.kind === "burst"
            ? ReactionKind.Burst
            : ReactionKind.Status,
      hpShare: e.kind === "shield" ? e.hpShare : 0,
      duration: e.kind === "shield" ? tickCount(e.duration) : 0,
      radius: e.kind === "burst" ? e.radius : 0,
      damage: e.kind === "burst" ? e.damage : 0,
      knock: e.kind === "burst" ? e.knock : 0,
      status:
        e.kind === "status"
          ? pickOf(e.status)
          : e.kind === "burst" && e.status
            ? pickOf(e.status)
            : null,
    };
  });
  return { list, table };
}

const pacing: Pacing = {
  surge: tickCount(FIELD_PACING.surgeSeconds),
  lull: tickCount(FIELD_PACING.lullSeconds),
  surgeOpening: FIELD_PACING.surgeOpening,
  respawnDelay: tickCount(FIELD_PACING.respawnDelay),
  spawnMinDistance: FIELD_PACING.spawnMinDistance,
  spawnMaxDistance: FIELD_PACING.spawnMaxDistance,
  regionLevels: FIELD_PACING.regionLevels,
  despawnDistance: FIELD_PACING.despawnDistance,
  despawnAfter: tickCount(FIELD_PACING.despawnSeconds),
  population: fieldPopulation,
  refillCap: (players, surge) => refillCap(players, surge ? "surge" : "lull"),
};

/** A hunting field's roster and regions for the step. */
export function fieldRule(def: FieldDef): FieldRule {
  const regions = Array.from({ length: regionCount(def) }, (_, r) => regionLevels(def, r));
  return {
    id: def.id,
    levels: def.levels,
    regions,
    levelAt: (region, roll) => spawnLevel(def, region, roll),
    populationMax: def.populationMax ?? Number.POSITIVE_INFINITY,
    roster: def.roster.map((e) => ({
      kind: monsterIndex.get(e.monster) as number,
      weight: e.weight,
      from: e.from ?? 0,
      maxAlive: e.maxAlive ?? 0,
    })),
  };
}

const PICKUP_KIND = {
  coin: PickupKind.Coin,
  page: PickupKind.Page,
  ink: PickupKind.Ink,
  binding: PickupKind.Binding,
  tool: PickupKind.Tool,
} as const;

const PAGE1_BOOKS = BOOKS.filter((b) => b.page === 1);
const PAGE1_TOOLS = TOOLS.filter((t) => PAGE1_BOOKS.some((b) => b.tool === t.id));

let compiled: SimRules | undefined;

/** Everything the combat step reads, compiled once. */
export function simRules(): SimRules {
  if (compiled) return compiled;
  const monsters = [...MONSTERS.map(monsterKind), golemKind(MONSTERS.length)];
  const reactions = reactionRules();
  compiled = {
    monsters,
    statuses: STATUS_IDS.map(statusRule),
    status: {
      shield: index("shield"),
      invulnerable: index("invulnerable"),
      infection: index("infection"),
    },
    reactions: reactions.list,
    reactionTable: reactions.table,
    books: BOOKS.map((b) => b.id),
    proof: { window: tickCount(PROOF.window), qed: PROOF.qed },
    elite: {
      everyKills: ELITE.everyKills,
      rank: ELITE.rank,
      massMult: ELITE.massMult,
      speedMult: ELITE.speedMult,
      armor: ELITE.armor,
      scale: ELITE.scale,
    },
    pacing,
    contactInterval: tickCount(CONTACT_INTERVAL),
    slowResist: { elite: SLOW_RESIST.elite, boss: SLOW_RESIST.boss },
    modeBonus: MODES.map((m) => m.bonus),
    autoPlay: {
      keepDistance: AUTO_PLAY.keepDistance,
      retreatHp: AUTO_PLAY.retreatHp,
      targetRange: AUTO_PLAY.targetRange,
      dodgeLead: tickCount(AUTO_PLAY.dodgeLead),
    },
    kit: compileKit,
    momentumDamage: (speed, baseSpeed, strength) => momentumDamage(speed, baseSpeed, strength),
    qedDamage,
    zenoDamage,
    rollDrops(random, ctx): SimDrop[] {
      const rank: RankName =
        ctx.monster.behavior === Behavior.Golem ? "boss" : ctx.elite ? "elite" : "normal";
      const drops = rollDrops(random, {
        source: { kind: "monster", fieldId: ctx.field, monsterId: ctx.monster.id, rank },
        level: ctx.level,
        rank: ctx.rank,
        coin: ctx.monster.coin,
        dropMult: ctx.dropMult,
        coinMult: ctx.coinMult,
        books: PAGE1_BOOKS,
        tools: PAGE1_TOOLS,
        spotlight: (MAJORS as readonly string[]).includes(ctx.major)
          ? (ctx.major as ClassId)
          : "math",
      });
      const out: SimDrop[] = [];
      for (const drop of drops) {
        const item = drop.item;
        if (item.kind === "coin") {
          // A coin drop bursts into a few pickups that share its amount.
          const [lo, hi] = DROPS.coinPickups;
          const pieces = Math.min(item.amount, lo + random.int(hi - lo + 1));
          let left = item.amount;
          for (let i = 0; i < pieces; i++) {
            const amount = i === pieces - 1 ? left : Math.floor(item.amount / pieces);
            left -= amount;
            out.push({
              kind: PickupKind.Coin,
              payload: { ...drop, item: { kind: "coin", amount } },
            });
          }
        } else {
          out.push({ kind: PICKUP_KIND[item.kind], payload: drop });
        }
      }
      return out;
    },
  };
  return compiled;
}

/** The kind index of a monster or the golem, for tools and tests. */
export function monsterKindIndex(id: string): number {
  if (id === ODAP_GOLEM.id) return MONSTERS.length;
  const i = monsterIndex.get(id);
  if (i === undefined) throw new Error(`unknown monster ${id}`);
  return i;
}

