import { BOOKS, TOOLS } from "./books.ts";
import { PROOF_CUES, REACTIONS } from "./classes.ts";
import { DROPS } from "./drops.ts";
import { FIELD_PACING, PAGE1_FIELDS } from "./fields.ts";
import { MODES } from "./modes.ts";
import { ELITE, MONSTERS, ODAP_GOLEM } from "./monsters.ts";
import { STATUSES } from "./statuses.ts";

/**
 * Every art and sound id the combat content names. Art ids are a sprite (`golem`) or a sprite
 * frame (`book/wangdo`); sound ids start with `sfx.`. The client checks these against the
 * atlases and the audio bank.
 */
export function combatCues(): { art: string[]; sounds: string[] } {
  const ids = new Set<string>();
  const add = (...values: (string | undefined)[]) => {
    for (const v of values) if (v) ids.add(v);
  };
  for (const b of BOOKS) add(...Object.values(b.cues), ...Object.values(b.evolution.cues));
  for (const t of TOOLS) add(t.icon);
  for (const m of MONSTERS) {
    add(m.sprite, ...Object.values(m.cues));
    if (m.behavior.kind === "ranged") add(m.behavior.projectile);
  }
  add(ODAP_GOLEM.sprite, ...Object.values(ODAP_GOLEM.cues), ELITE.aura, ELITE.spawnCue);
  for (const s of Object.values(STATUSES)) add(s.icon);
  for (const r of REACTIONS) add(r.cue.vfx, r.cue.sfx);
  add(...Object.values(PROOF_CUES));
  for (const m of MODES) add(m.icon);
  add(DROPS.coinSprite, DROPS.pageSprite, ...Object.values(DROPS.pickupCue));
  add(FIELD_PACING.bellCue, FIELD_PACING.surgeCue);
  const all = [...ids].sort();
  return {
    art: all.filter((id) => !id.startsWith("sfx.")),
    sounds: all.filter((id) => id.startsWith("sfx.")),
  };
}

/** Broken references between combat definitions. Empty when the data is consistent. */
export function checkCombatContent(): string[] {
  const problems: string[] = [];
  const monsterIds = new Set(MONSTERS.map((m) => m.id));
  const toolIds = new Set(TOOLS.map((t) => t.id));
  const bookIds = new Set<string>();
  for (const b of BOOKS) {
    if (bookIds.has(b.id)) problems.push(`book ${b.id} is defined twice`);
    bookIds.add(b.id);
    if (!toolIds.has(b.tool)) problems.push(`book ${b.id} links unknown tool ${b.tool}`);
    for (const [form, a] of [
      [b.id, b.attack],
      [b.evolution.id, b.evolution.attack],
    ] as const) {
      if (a === null && !b.signature)
        problems.push(`book ${form} has neither attack nor signature`);
      if (a?.kind === "orbit" && a.duration > a.cooldown)
        problems.push(`book ${form} orbits longer than its cooldown`);
    }
    let last = 0;
    for (const step of b.levels) {
      if (step.at <= last) problems.push(`book ${b.id} level steps are out of order`);
      last = step.at;
    }
  }
  for (const m of MONSTERS) {
    if (m.behavior.kind === "splitter" && !monsterIds.has(m.behavior.into))
      problems.push(`monster ${m.id} splits into unknown ${m.behavior.into}`);
  }
  if (!monsterIds.has(ODAP_GOLEM.summon.monster))
    problems.push(`golem summons unknown ${ODAP_GOLEM.summon.monster}`);
  for (const f of PAGE1_FIELDS) {
    for (const r of f.roster)
      if (!monsterIds.has(r.monster)) problems.push(`field ${f.id} spawns unknown ${r.monster}`);
  }
  return problems;
}
