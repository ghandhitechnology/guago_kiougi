/**
 * Balance sanity check for M2, not the M3 simulator. Plays the formulas forward for one
 * character per class with its two M2 books through levels 1 to 100 against Page 1 monsters of
 * its own level, and prints time-to-kill, kills per minute and time per level so absurd numbers
 * show up early. Deterministic and analytic: expected damage per second, no random rolls.
 *
 * Profile: 반자동, every stat point in 이해력, both books at the character's level, grade 교과서,
 * no 필기, no tools, solo. A horde around a kiting player is taken as one monster per 30×30 px of
 * attack area, at most 12 per attack; 30% of area damage is lost to overkill.
 *
 *   pnpm --filter @guago/balance-sim sanity
 */
import { existsSync, readFileSync } from "node:fs";
import {
  type Attack,
  BOOKS,
  type BookDef,
  CLASS_IDS,
  CLASS_NAMES,
  type ClassId,
  checkCombatContent,
  combatCues,
  FIELD_PACING,
  forecast,
  MOMENTUM,
  monsterById,
  ODAP_GOLEM,
  PROOF,
  REACTIONS,
  resolveAttack,
  STATUSES,
  type StatusApply,
  type StatusId,
} from "@guago/content";
import {
  BookGrade,
  bookDamage,
  expToNext,
  hitDamage,
  killsPerLevel,
  MODE_BONUS,
  mitigate,
  monsterDamage,
  monsterEXP,
  monsterHP,
  NO_STATS,
  playerHP,
  Rank,
  STAT_POINTS_PER_LEVEL,
  statEffects,
} from "@guago/shared";

const DENSITY_AREA = 900;
const MAX_TARGETS = 12;
const OVERKILL = 0.7;
const SAMPLES = [1, 10, 25, 50, 75, 100];

const targets = (area: number) => Math.min(MAX_TARGETS, Math.max(1, area / DENSITY_AREA));

/** Extra damage over time a status adds, as a multiple of the hit that applied it. */
function dotShare(status: StatusApply | readonly StatusApply[] | undefined): number {
  if (!status) return 0;
  const list: readonly StatusApply[] = Array.isArray(status) ? status : [status as StatusApply];
  const shares = list.map((s) => {
    const def = STATUSES[s.id as StatusId];
    return (def.dot ?? 0) * def.duration * s.chance * Math.min(s.stacks, def.maxStacks);
  });
  return shares.reduce((a, b) => a + b, 0) / list.length;
}

/** Damage per second in units of book damage: on one target, and summed over a horde. */
function attackRate(a: Attack, baseDelay: number, cls: ClassId): { single: number; aoe: number } {
  const dot = 1 + dotShare(a.status);
  const follow = a.followUp ? a.followUp.damage * (1 + dotShare(a.followUp.status)) : 0;
  switch (a.kind) {
    case "orbit": {
      const rate = Math.min(1 / a.hitInterval, a.count / a.period) * (a.duration / a.cooldown);
      const single = a.damage * rate * dot;
      return { single, aoe: single * targets(2 * Math.PI * a.orbitRadius * 2 * a.bodyRadius) };
    }
    case "beam": {
      const single = (a.damage * dot) / a.cooldown;
      return { single, aoe: single * targets(a.length * (a.width + a.amplitude)) };
    }
    case "projectile": {
      const shot = a.damage * dot;
      const pool =
        a.poolDamage && a.poolDuration && a.poolTickInterval
          ? a.poolDamage * (a.poolDuration / a.poolTickInterval) * (1 + dotShare(a.poolStatus))
          : 0;
      const single = (a.count * shot + pool) / a.cooldown;
      const hitArea =
        a.gravity > 0 ? targets(Math.PI * a.impactRadius ** 2) : Math.min(1 + a.pierce, 3);
      const poolArea = a.poolRadius ? targets(Math.PI * a.poolRadius ** 2) : 0;
      return { single, aoe: (a.count * shot * hitArea + pool * poolArea) / a.cooldown };
    }
    case "chain": {
      let sum = 0;
      for (let k = 0; k <= a.jumps; k++) sum += a.falloff ** k;
      return { single: (a.damage * dot) / a.cooldown, aoe: (a.damage * dot * sum) / a.cooldown };
    }
    case "cone": {
      const single = (a.hits * a.damage * dot + follow) / a.cooldown;
      const area = targets((a.angle / 360) * Math.PI * a.range ** 2);
      let aoe = single * area;
      // 반응 표: 가연 then 불 from the same book completes 연소 on every target each cast.
      if (cls === "chemistry" && a.status && !Array.isArray(a.status) && a.followUp?.status) {
        const r = REACTIONS.find((x) => x.id === "combustion");
        if (r?.effect.kind === "burst")
          aoe +=
            (r.effect.damage * a.followUp.damage * targets(Math.PI * r.effect.radius ** 2)) /
            a.cooldown;
      }
      return { single, aoe };
    }
    case "summon": {
      const single = (a.cap * a.damage * dot) / a.hitInterval;
      return { single, aoe: single };
    }
    case "telegraph": {
      const f = forecast(baseDelay, 1);
      const area = a.shape === "line" ? a.length * a.width : Math.PI * a.radius ** 2;
      const single = (a.count * a.damage * f.damage * dot) / a.cooldown;
      return { single, aoe: single * targets(area * f.area) };
    }
    case "wave":
    case "zone":
    case "dash":
      throw new Error(`no M2 book uses ${a.kind}`);
  }
}

interface Row {
  level: number;
  ttkNormal: number;
  ttkElite: number;
  dpsKpm: number;
  kpm: number;
  minutesPerLevel: number;
}

function play(cls: ClassId, books: readonly BookDef[]) {
  const supplyKpm =
    (FIELD_PACING.spawnBase + FIELD_PACING.spawnPerPlayer) *
    60 *
    (FIELD_PACING.surgeSeconds / (FIELD_PACING.surgeSeconds + FIELD_PACING.lullSeconds));
  const rows: Row[] = [];
  let totalMinutes = 0;
  const effects = statEffects(NO_STATS);
  const crit = 1 + effects.critChance * (effects.critMult - 1);
  for (let level = 1; level <= 100; level++) {
    const understanding = STAT_POINTS_PER_LEVEL * level;
    let single = 0;
    let aoe = 0;
    for (const b of books) {
      if (!b.attack) continue;
      const r = resolveAttack(b.attack, b.levels, {
        bookLevel: level,
        tools: [],
        cooldownMult: effects.cooldownMult,
        durationMult: effects.durationMult,
      });
      const rate = attackRate(r.attack, r.baseDelay, cls);
      const dmg = hitDamage(
        bookDamage(b.base, level, BookGrade.Textbook, 0),
        understanding,
        crit,
        1,
        MODE_BONUS.semi,
      );
      single += rate.single * dmg;
      aoe += rate.aoe * dmg;
    }
    if (cls === "physics") {
      // 운동량 while walking at base speed, and collisions from knocked monsters in a crowd.
      single *= 1 + MOMENTUM.speedDamage;
      aoe *= (1 + MOMENTUM.speedDamage) * (1 + MOMENTUM.collisionShare * 0.5);
    }
    // Q.E.D. adds qed / maxStacks on anything that survives ten hits.
    const proof = cls === "math" ? 1 + PROOF.qed / PROOF.maxStacks : 1;
    const hp = monsterHP(level, Rank.Normal) * monsterById("odap").hp;
    const eliteHp = monsterHP(level, Rank.Elite);
    const dpsKpm = ((aoe * OVERKILL) / hp) * 60;
    const kpm = Math.min(dpsKpm, supplyKpm);
    const minutes = expToNext(level) / (kpm * monsterEXP(level, Rank.Normal));
    totalMinutes += minutes;
    if (SAMPLES.includes(level)) {
      rows.push({
        level,
        ttkNormal: hp / single,
        ttkElite: eliteHp / mitigate(single * proof, 0.2),
        dpsKpm,
        kpm,
        minutesPerLevel: minutes,
      });
    }
  }
  return { rows, hours: totalMinutes / 60, supplyKpm };
}

const pad = (v: string | number, n: number) => String(v).padStart(n);
const fixed = (v: number, d = 1) => v.toFixed(d);

console.log("Balance sanity, Page 1, one player per class with its two M2 books\n");
let supply = 0;
const totals: string[] = [];
for (const cls of CLASS_IDS) {
  const books = BOOKS.filter((b) => b.subject === cls);
  const { rows, hours, supplyKpm } = play(cls, books);
  supply = supplyKpm;
  console.log(`${CLASS_NAMES[cls]} · ${books.map((b) => b.name).join(" + ")}`);
  console.log("  level  ttk normal  ttk elite  kills/min by dps  kills/min  min/level");
  for (const r of rows) {
    console.log(
      `  ${pad(r.level, 5)}  ${pad(fixed(r.ttkNormal, 2), 9)}s  ${pad(fixed(r.ttkElite), 8)}s  ${pad(fixed(r.dpsKpm, 0), 16)}  ${pad(fixed(r.kpm, 0), 9)}  ${pad(fixed(r.minutesPerLevel), 9)}`,
    );
  }
  totals.push(`  ${CLASS_NAMES[cls]}: ${fixed(hours)} h of active solo play from 1 to 100`);
  console.log();
}
console.log(`Field supply for a solo player: ${fixed(supply)} kills/min at most`);
console.log(totals.join("\n"));
const killsTo100 = Array.from({ length: 99 }, (_, i) => killsPerLevel(i + 1)).reduce(
  (a, b) => a + b,
);
console.log(`  ${killsTo100} same-level kills from 1 to 100`);

// Golem and survival checks.
{
  const level = ODAP_GOLEM.level;
  const hp = monsterHP(level, ODAP_GOLEM.rank);
  const slam = monsterDamage(level, ODAP_GOLEM.rank) * ODAP_GOLEM.slam.damage;
  const php = playerHP(level, 0);
  console.log(
    `\n오답노트 골렘 at level ${level}: ${fixed(hp, 0)} HP, slam ${fixed(slam, 0)} = ${fixed((100 * slam) / php, 0)}% of a new player's ${fixed(php, 0)} HP`,
  );
  for (const cls of CLASS_IDS) {
    const books = BOOKS.filter((b) => b.subject === cls);
    let single = 0;
    for (const b of books) {
      if (!b.attack) continue;
      const r = resolveAttack(b.attack, b.levels, {
        bookLevel: level,
        tools: [],
        cooldownMult: 1,
        durationMult: 1,
      });
      single +=
        attackRate(r.attack, r.baseDelay, cls).single *
        hitDamage(bookDamage(b.base, level, 0, 0), 3 * level, 1.025, 1, 1);
    }
    console.log(
      `  ${CLASS_NAMES[cls]} kills it in ${fixed(hp / mitigate(single * (cls === "math" ? 1 + PROOF.qed / PROOF.maxStacks : 1), ODAP_GOLEM.armor), 0)} s`,
    );
  }
  const touch = php / (5 * monsterDamage(level, Rank.Normal));
  console.log(`Five 오답 touching a new player knock them out in ${fixed(touch)} s`);
}

const problems = checkCombatContent();
console.log(
  problems.length
    ? `\nContent problems:\n  ${problems.join("\n  ")}`
    : "\nContent references are consistent",
);

const artPath = new URL("../../../packages/art/dist/art.json", import.meta.url);
if (existsSync(artPath)) {
  const art = JSON.parse(readFileSync(artPath, "utf8")) as {
    sprites: Record<string, { frames: string[] }>;
  };
  const exists = (id: string) => {
    const [sprite] = id.split("/");
    const def = art.sprites[sprite ?? ""];
    return id.includes("/") ? !!def?.frames.includes(id) : !!def;
  };
  const { art: ids, sounds } = combatCues();
  const missing = ids.filter((id) => !exists(id));
  console.log(`\nArt the combat content names but the atlases lack (${missing.length}):`);
  console.log(`  ${missing.join(", ")}`);
  console.log(`Sound cues to record (${sounds.length}):`);
  console.log(`  ${sounds.join(", ")}`);
} else {
  console.log("\nRun pnpm art:build to list missing art");
}
