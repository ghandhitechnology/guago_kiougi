import type { Prop, SceneDef } from "../scene.ts";
import { scene } from "../scene.ts";
import { crowd, fx, mob, student } from "./fight.ts";
import { DIRT, DIRT_LEGEND, FIELD, FIELD_LEGEND } from "./telegraph-aims.ts";

/**
 * round2-kit: the second round's redraws in a crowd. Top left, 조석 예보표's tide running out
 * with its spray ahead and the wet ground behind; top right, 몰 계산 문제집's spray and
 * 아보가드로 수's clusters; bottom left, 실험 보고서's fuel thrown in two directions, one still
 * flying and one landed; across the middle, the four evolutions that used to be recolours:
 * 프린키피아 with its ribbon, 기댓값 정리's rising die, 멘델레예프의 꿈's cloud and 집단 면역's
 * linked rings. The question: does each evolved form read as its own shape from across a field?
 */

const TIDE: [number, number] = [86, 72];
const MOLE: [number, number] = [300, 40];
const FUEL: [number, number] = [52, 214];
const HERD: [number, number] = [408, 196];

const ANTIBODIES: Prop[] = [0, 1, 2, 3].map((k) => {
  const a = (k / 4) * Math.PI * 2 + 0.4;
  return fx(
    "evo-herd-immunity",
    HERD[0] + Math.round(Math.cos(a) * 20),
    HERD[1] - 10 + Math.round(Math.sin(a) * 10),
    { anim: "tumble", index: k * 2 },
  );
});

function make(name: string, theme: string, ground: string, legend: SceneDef["legend"]): SceneDef {
  return scene({
    name,
    seed: 93,
    theme,
    legend,
    ground,
    details: [
      fx("atk-tide", TIDE[0], TIDE[1], { frame: "out60" }),
      fx("atk-fuel-spray", 196, 214, { anim: "wide14", index: 3 }),
      fx("evo-herd-immunity", HERD[0], HERD[1], { anim: "ring", index: 1 }),
      fx("evo-herd-immunity", HERD[0] + 46, HERD[1] + 30, { anim: "ring", index: 3 }),
    ],
    objects: [
      ...crowd(
        5,
        26,
        [150, 70, 470, 262],
        [
          [MOLE[0], MOLE[1] + 30, 40],
          [HERD[0], HERD[1], 34],
          [196, 214, 34],
          [250, 136, 30],
        ],
      ),
      mob("odap", 150, 64, "hit"),
      mob("odap-pencil", 24, 108, "hit", 0, false),
      mob("odap", 112, 200, "hit"),
      mob("element-water", 96, 236, "hit"),
      student("reader", TIDE[0], TIDE[1], 1),
      student("curls", MOLE[0], MOLE[1], 2),
      student("club", FUEL[0], FUEL[1], 1),
      student("curls", 196, 214, 2, true),
      student("summer", HERD[0], HERD[1], 1),
      student("bedhead", HERD[0] + 46, HERD[1] + 30, 2),
    ],
    atmosphere: [
      fx("atk-particles", MOLE[0], MOLE[1] - 6, { anim: "fan4", index: 2 }),
      fx("evo-avogadro", 362, 30, { anim: "c0" }),
      fx("evo-avogadro", 382, 46, { anim: "c1" }),
      fx("evo-avogadro", 400, 28, { anim: "c2" }),
      fx("atk-fuel-spray", FUEL[0] + 4, FUEL[1] - 8, { anim: "fan0", index: 2 }),
      fx("evo-principia", 226, 118, { anim: "fly2", index: 1 }),
      fx("evo-principia", 340, 108, { anim: "fly9", index: 3 }),
      fx("evo-expectation", 252, 160, { anim: "spin", index: 1 }),
      fx("evo-expectation", 284, 176, { anim: "face6" }),
      fx("evo-mendeleev", 180, 150, { anim: "Na" }),
      fx("evo-mendeleev", 150, 166, { anim: "Fe", index: 1 }),
      ...ANTIBODIES,
    ],
  });
}

export default make("round2-kit", "greece", DIRT, DIRT_LEGEND);
export const night = make("round2-kit-night", "field-night", FIELD, FIELD_LEGEND);
