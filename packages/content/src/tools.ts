import type { AttackKind, ToolDef, ToolStat } from "./attacks.ts";
import { studyText } from "./narrative/study.ts";

const tool = (
  id: string,
  stat: ToolStat,
  perLevel: number,
  kinds?: readonly AttackKind[],
): ToolDef => {
  const text = studyText(`tool:${id}`);
  return {
    id,
    name: text.name,
    description: text.desc,
    stat,
    perLevel,
    ...(kinds ? { kinds } : {}),
    icon: `tool/${id}`,
  };
};

/**
 * The thirty linked tools of PLAN §8, in book order. Effects are per tool level, 1 to 5: at
 * level 5 a share stat gives five times `perLevel`, a counted stat five more.
 */
export const TOOLS: readonly ToolDef[] = [
  tool("compass", "area", 0.08),
  tool("grid-ruler", "range", 0.1),
  tool("calculator", "cooldown", 0.05),
  tool("dice", "critChance", 0.02),
  tool("set-square", "moveSpeed", 0.03),
  tool("red-pen", "critDamage", 0.1),
  tool("weight", "knock", 0.2),
  tool("stopwatch", "attackSpeed", 0.06),
  tool("battery", "chain", 1),
  tool("prism", "pierce", 1),
  tool("spring", "range", 0.12, ["dash"]),
  tool("apple", "pull", 0.12),
  tool("pipette", "statusDuration", 0.1),
  tool("element-card", "luck", 0.04),
  tool("molecule-kit", "range", 0.1, ["cone"]),
  tool("alcohol-lamp", "burn", 0.15),
  tool("scale", "hits", 1, ["cone"]),
  tool("indicator", "shield", 0.15),
  tool("microscope", "minionCap", 1),
  tool("peas", "spread", 1),
  tool("tweezers", "bleed", 0.15),
  tool("flowerpot", "area", 0.1, ["zone"]),
  tool("test-tube", "aura", 0.15),
  tool("vaccine", "healing", 0.2),
  tool("seismometer", "telegraphSpeed", 0.06),
  tool("rock-hammer", "impact", 0.1),
  tool("wind-vane", "area", 0.1, ["zone"]),
  tool("telescope", "forecast", 0.1),
  tool("calendar", "cooldown", 0.06, ["wave"]),
  tool("thermometer", "area", 0.1, ["telegraph"]),
];
