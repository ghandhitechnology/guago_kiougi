import type { SceneDef } from "../scene.ts";
import { scene } from "../scene.ts";
import { fx, mob, student } from "./fight.ts";
import { DIRT, DIRT_LEGEND, FIELD, FIELD_LEGEND } from "./telegraph-aims.ts";

/**
 * telegraph-radii: every circle telegraph at the radius it is drawn for, never scaled. Top
 * left, a row of enemy circles from 16 to 48 filling; bottom left, the golem's slam at 56 with
 * the enraged 80 dashed round it; right, a 지구과학 student's 예보 rings at 24 to 48 and the
 * storm over them, the rain and the strike. The question: are the stripes and dashed rims intact
 * at every size, and does the amber 예보 hold on sunlit dirt from its first frame?
 */

const EARTH: [number, number] = [262, 150];

function make(name: string, theme: string, ground: string, legend: SceneDef["legend"]): SceneDef {
  return scene({
    name,
    seed: 92,
    theme,
    legend,
    ground,
    details: [
      fx("tele-circle", 28, 34, { anim: "fill16", index: 4 }),
      fx("tele-circle", 78, 40, { anim: "fill24", index: 3 }),
      fx("tele-circle", 148, 44, { anim: "fill32", index: 2 }),
      fx("tele-circle", 246, 50, { anim: "fill48", index: 1 }),
      fx("tele-circle", 112, 200, { anim: "fill80", index: 0 }),
      fx("tele-circle", 112, 200, { anim: "fill56", index: 3 }),
      fx("tele-circle", 392, 222, { anim: "fire64", index: 0 }),
      fx("fx-forecast-ring", 340, 40, { anim: "warn24", index: 0 }),
      fx("fx-forecast-ring", 420, 64, { anim: "warn32", index: 1 }),
      fx("fx-forecast-ring", 330, 120, { anim: "warn40", index: 2 }),
      fx("fx-forecast-ring", 420, 140, { anim: "warn48", index: 3 }),
      fx("fx-rain", EARTH[0], EARTH[1], { anim: "fall", play: true }),
    ],
    objects: [
      mob("element-fire", 148, 44, "move", 1),
      mob("element-fire", 246, 50, "move", 2),
      mob("rational", 112, 200, "walk", 1),
      mob("odap", 60, 120, "hop", 1),
      mob("odap-pencil", 200, 112, "hop", 2),
      mob("odap", 216, 236, "hop", 3),
      mob("odap", 286, 176, "hit"),
      mob("odap-pencil", 330, 120, "hit"),
      mob("odap", 420, 140, "hit", 0, true),
      mob("rational", 392, 222, "hit", 0, true),
      student("bedhead", EARTH[0], EARTH[1], 1),
    ],
    atmosphere: [
      fx("atk-cloud", EARTH[0], EARTH[1] - 30, { anim: "drift", play: true }),
      fx("fx-thunder", 286, 176, { anim: "strike", index: 0 }),
      fx("fx-thunder", 330, 120, { anim: "strike", index: 1 }),
      fx("fx-thunder", 420, 140, { anim: "strike", index: 2 }),
    ],
  });
}

export default make("telegraph-radii", "greece", DIRT, DIRT_LEGEND);
export const night = make("telegraph-radii-night", "field-night", FIELD, FIELD_LEGEND);
