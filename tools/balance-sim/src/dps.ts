/**
 * Expected damage per second of a loadout, from the real attack data. Analytic, not a combat
 * simulation: each behaviour turns into hits per second on one target (`single`) and summed over
 * the horde around a kiting player (`aoe`), in units of the book's damage.
 *
 * A horde is taken as one monster per 2000 px² of attack area (about 60 on a 480×270 screen), at most 8 per attack.
 */
import {
  type Attack,
  type BookDef,
  type ClassId,
  forecast,
  MOMENTUM,
  PROLIFERATION,
  proliferation,
  REACTIONS,
  resolveAttack,
  STATUSES,
  type StatusApply,
  signatureStrength,
  type ToolDef,
  toolPassives,
} from "@guago/content";
import {
  type BookGrade,
  bookDamage,
  hitDamage,
  MODE_BONUS,
  type Stats,
  statEffects,
} from "@guago/shared";

export const DENSITY_AREA = 2000;
export const MAX_TARGETS = 8;

export const targets = (area: number) => Math.min(MAX_TARGETS, Math.max(1, area / DENSITY_AREA));

/** Extra damage over time a status adds, as a multiple of the hit that applied it. */
export function dotShare(
  status: StatusApply | readonly StatusApply[] | undefined,
  mods: Readonly<Record<string, number>> = {},
): number {
  if (!status) return 0;
  const list: readonly StatusApply[] = Array.isArray(status) ? status : [status as StatusApply];
  const shares = list.map((s) => {
    if (s.self) return 0;
    const def = STATUSES[s.id];
    const boost = mods[s.id] ?? 1;
    const duration = def.duration * (mods.statusDuration ?? 1);
    return (def.dot ?? 0) * boost * duration * s.chance * Math.min(s.stacks, def.maxStacks);
  });
  return shares.reduce((a, b) => a + b, 0) / list.length;
}

export interface Rate {
  readonly single: number;
  readonly aoe: number;
}

/** Hits per second of one resolved attack, in book-damage units. */
export function attackRate(
  a: Attack,
  baseDelay: number,
  mods: Readonly<Record<string, number>>,
  cls: ClassId,
  strength: number,
): Rate {
  const dot = 1 + dotShare(a.status, mods);
  const follow = a.followUp ? a.followUp.damage * (1 + dotShare(a.followUp.status, mods)) : 0;
  let roll = 1;
  for (const s of a.specials ?? [])
    if (s.kind === "roll") roll = s.rising ? s.max * 0.8 : (s.min + s.max) / 2;
  let trail = 0;
  for (const s of a.specials ?? [])
    if (s.kind === "trail")
      trail =
        ((s.trail.damage * s.trail.duration) / s.trail.tickInterval) *
        targets(Math.PI * s.trail.radius ** 2);
  const perCast = (single: number, area: number): Rate => ({
    single: (single * roll + follow) / a.cooldown,
    aoe: ((single * roll + follow) * area + trail) / a.cooldown,
  });
  switch (a.kind) {
    case "orbit": {
      const rate = Math.min(1 / a.hitInterval, a.count / a.period) * (a.duration / a.cooldown);
      const arc = (a.sweep ?? 360) / 360;
      const single = a.damage * rate * dot * (a.sweep ? 0.6 : 1);
      return {
        single,
        aoe: single * targets(2 * Math.PI * arc * a.orbitRadius * 2 * a.bodyRadius),
      };
    }
    case "beam": {
      const n = a.count ?? 1;
      const r = perCast(
        a.damage * dot,
        targets(a.length * (a.width + a.amplitude)) * (1 + a.reflect * 0.5),
      );
      return { single: r.single * Math.min(n, 2), aoe: r.aoe * n };
    }
    case "projectile": {
      const burst = a.burst ? a.burst.reduce((x, y) => x + y, 0) / a.burst.length : a.count;
      const shot = a.damage * dot;
      const pool =
        a.poolDamage && a.poolDuration && a.poolTickInterval
          ? a.poolDamage *
            (a.poolDuration / a.poolTickInterval) *
            (1 + dotShare(a.poolStatus, mods))
          : 0;
      const hitArea =
        a.gravity > 0
          ? targets(Math.PI * a.impactRadius ** 2)
          : Math.min(1 + a.pierce + a.bounce, 4);
      const poolArea = a.poolRadius ? targets(Math.PI * a.poolRadius ** 2) : 0;
      return {
        single: (burst * shot * roll + pool) / a.cooldown,
        aoe: (burst * shot * roll * hitArea + pool * poolArea + trail) / a.cooldown,
      };
    }
    case "chain": {
      let sum = 0;
      for (let k = 0; k <= a.jumps; k++) sum += a.falloff ** k;
      const fork = (a.specials ?? []).some((s) => s.kind === "fork") ? 1.5 : 1;
      return {
        single: (a.damage * dot) / a.cooldown,
        aoe: (a.damage * dot * sum * fork) / a.cooldown,
      };
    }
    case "cone": {
      let range = a.range;
      for (const s of a.specials ?? []) if (s.kind === "grow") range += s.max / 2;
      const r = perCast(a.hits * a.damage * dot, targets((a.angle / 360) * Math.PI * range ** 2));
      let aoe = r.aoe;
      // 반응 표: 가연 then 불 from the same book completes 연소 on every target each cast.
      if (cls === "chemistry" && a.followUp?.status?.id === "burn") {
        const burst = REACTIONS.find((x) => x.id === "combustion")?.effect;
        if (burst?.kind === "burst")
          aoe +=
            (strength * burst.damage * a.followUp.damage * targets(Math.PI * burst.radius ** 2)) /
            a.cooldown;
      }
      return { single: r.single, aoe };
    }
    case "summon": {
      const cap = a.cap + (cls === "biology" ? proliferation(strength).minionCap : 0);
      const single = (cap * a.damage * dot) / a.hitInterval;
      return { single, aoe: single };
    }
    case "telegraph": {
      const f = forecast(baseDelay, cls === "earth" ? strength : 0);
      const fc = 1 + (f.damage - 1) * (mods.forecast ?? 1);
      const area = a.shape === "line" ? a.length * a.width : Math.PI * a.radius ** 2;
      const strikes = a.count * (1 + a.repeat);
      return perCast(strikes * a.damage * fc * dot, targets(area * f.area));
    }
    case "wave": {
      const passes = (a.count ?? 1) * (a.pull > 0 ? 2 : 1);
      const ring = Math.PI * a.radius ** 2;
      return perCast(passes * a.damage * dot, targets(ring));
    }
    case "zone": {
      if (a.affects === "allies") return { single: 0, aoe: 0 };
      const ticks = a.duration / a.tickInterval;
      const grown = a.radius + ((a.growth ?? 0) * a.duration) / 2;
      return perCast(ticks * a.damage * dot, targets(Math.PI * grown ** 2));
    }
    case "dash":
      return perCast(a.damage * dot, targets(a.distance * a.width));
  }
}

export interface OwnedBook {
  readonly def: BookDef;
  readonly level: number;
  readonly grade: BookGrade;
  readonly pilgi: number;
}

export interface Loadout {
  readonly cls: ClassId;
  readonly books: readonly OwnedBook[];
  readonly tools: readonly { readonly def: ToolDef; readonly level: number }[];
  readonly stats: Stats;
}

export interface Damage {
  /** Damage per second on one target and summed over a horde, before armour. */
  readonly single: number;
  readonly aoe: number;
}

/** Expected damage per second of a loadout in 반자동, walking. */
export function loadoutDamage(l: Loadout): Damage {
  const fx = statEffects(l.stats);
  const passive = toolPassives(l.tools);
  const critChance = Math.min(0.8, fx.critChance + passive.critChance);
  const critMult = fx.critMult + passive.critDamage;
  const crit = 1 + critChance * (critMult - 1);
  const strength = signatureStrength(l.cls, l.cls);
  let single = 0;
  let aoe = 0;
  let attackSpeed = 0;
  for (const b of l.books) {
    const a = b.def.attack;
    if (a?.kind === "zone" && a.affects === "allies") attackSpeed += a.buff?.attackSpeed ?? 0;
  }
  for (const b of l.books) {
    const hit = hitDamage(
      bookDamage(b.def.base, b.level, b.grade, b.pilgi),
      l.stats.understanding,
      crit,
      1,
      MODE_BONUS.semi,
    );
    if (!b.def.attack) {
      // 증명 노트: an extra Q.E.D. burst of its own damage every (cap) hits on one target.
      const sig = b.def.signature;
      if (sig) single += (sig.qedDamage * hit) / 4;
      continue;
    }
    const r = resolveAttack(b.def.attack, b.def.levels, {
      bookLevel: b.level,
      tools: l.tools,
      cooldownMult: fx.cooldownMult / (1 + attackSpeed),
      durationMult: fx.durationMult,
    });
    const rate = attackRate(r.attack, r.baseDelay, r.mods, l.cls, strength);
    single += rate.single * hit;
    aoe += rate.aoe * hit;
  }
  if (l.cls === "physics") {
    // 운동량 while walking at base speed, and collisions between knocked monsters in a crowd.
    single *= 1 + MOMENTUM.speedDamage * strength;
    aoe *= (1 + MOMENTUM.speedDamage * strength) * (1 + MOMENTUM.collisionShare * strength * 0.5);
  }
  if (l.cls === "biology") aoe *= 1 + PROLIFERATION.infectOnHit.chance * strength * 0.3;
  return { single, aoe };
}
