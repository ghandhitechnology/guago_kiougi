import type { Prop, SceneDef } from "../scene.ts";
import { scene } from "../scene.ts";
import { fx, laid, mob, student } from "./fight.ts";

/**
 * telegraph-aims: every line telegraph laid the way the client lays it, at angles on the sixteen
 * aims and between them. Left, chargers wind up their lanes, one firing; right, a 지구과학
 * student's 예보 traced at four stages, the fault opening and closing, and 판 구조론's plates
 * grinding. The question: does a line keep its look at every angle, and does the drawn lane
 * still point where the monster will go?
 */

const EARTH: [number, number] = [318, 140];

const lines: Prop[] = [
  // Enemy lanes: on an aim, between aims, and the strike.
  ...laid("tele-line", "charge", 36, 36, 0, 112, 12, { index: 1 }),
  ...laid("tele-line", "charge", 36, 74, 14, 112, 12, { index: 2 }),
  ...laid("tele-line", "charge", 30, 128, 33, 112, 12, { index: 3 }),
  ...laid("tele-line", "fire", 40, 250, -24, 112, 12),
  ...laid("tele-line", "charge", 200, 30, 101, 112, 12, { index: 0 }),
  ...laid("tele-line", "charge", 236, 250, -128, 104, 12, { index: 2 }),
  // The 예보 from the student, one line per stage.
  ...laid("fx-forecast", "warn", EARTH[0], EARTH[1], 180 + 12, 120, 16, {
    variants: 2,
    index: 1,
    start: true,
  }),
  ...laid("fx-forecast", "warn", EARTH[0], EARTH[1], 58, 120, 16, {
    variants: 2,
    index: 2,
    start: true,
  }),
  ...laid("fx-forecast", "warn", EARTH[0], EARTH[1], -90, 110, 16, {
    variants: 2,
    index: 3,
    start: true,
  }),
  ...laid("fx-forecast", "break", EARTH[0], EARTH[1], -30, 150, 16, { variants: 2, start: true }),
  // The fault opening on one line, closing on another, and the plates.
  ...laid("fx-fault", "open", EARTH[0] + 6, EARTH[1] + 8, 135, 120, 16, {
    variants: 2,
    index: 2,
    start: true,
  }),
  ...laid("fx-fault", "close", EARTH[0] + 10, EARTH[1] + 4, 20, 140, 16, {
    variants: 2,
    index: 0,
    start: true,
  }),
  ...laid("evo-plate-tectonics", "grind", 300, 262, -8, 170, 16, { start: true }),
];

function make(name: string, theme: string, ground: string, legend: SceneDef["legend"]): SceneDef {
  return scene({
    name,
    seed: 91,
    theme,
    legend,
    ground,
    details: lines,
    objects: [
      mob("element-air", 30, 36, "move", 1, false),
      mob("element-air", 30, 74, "move", 2, false),
      mob("element-air", 24, 128, "move", 0, false),
      mob("element-air", 34, 250, "move", 3, false),
      mob("element-air", 200, 26, "move", 1, false),
      mob("element-air", 240, 254, "move", 0, true),
      mob("odap", 152, 60, "hop", 1),
      mob("odap", 104, 156, "hop", 2),
      mob("odap-pencil", 120, 200, "hop", 0),
      mob("odap", 226, 128, "hit"),
      mob("rational", 420, 176, "hit", 0, true),
      mob("odap", 402, 110, "hit", 0, true),
      student("bedhead", EARTH[0], EARTH[1], 1),
    ],
  });
}

export const DIRT = `
  ggggggggddddddddddddddmmmmmmmm
  gggggdddddddddddddddddddmmmmmm
  gggddddddddddddddddddddddmmmmm
  ggdddddddddddddddddddddddddmmm
  gddddddddddddddddddddddddddddd
  dddddddddddddddddddddddddddddd
  dddddddddddddddddddddddddddddd
  dddddddddddddddddddddddddddddd
  dddddddddddddddddddddddddddddd
  dddddddddddddddddddddddddddddd
  dddddddddddddddddddddddddddddd
  dddddddddddddddddddddddddddddd
  dddddddddddddddddddddddddddddd
  dddddddddddddddddddddddddddddd
  gddddddddddddddddddddddddddddd
  ggddddddddddddddddddddddddddgg
  gggddddddddddddddddddddddggggg
`;

export const FIELD = `
  gggggggggggggggggggggggggggggg
  ggggssssssssssssssssssssssgggg
  gggsssssssssssssssssssssssssgg
  ggssssssssssssssssssssssssssgg
  ggssssssssssssssssssssssssssgg
  gsssssssssssssssssssssssssssss
  gsssssssssssssssssssssssssssss
  ssssssssssssssssssssssssssssss
  ssssssssssssssssssssssssssssss
  ssssssssssssssssssssssssssssss
  ssssssssssssssssssssssssssssss
  gsssssssssssssssssssssssssssss
  gsssssssssssssssssssssssssssss
  ggssssssssssssssssssssssssssgg
  ggssssssssssssssssssssssssssgg
  gggsssssssssssssssssssssssssgg
  ggggssssssssssssssssssssssgggg
`;

export const DIRT_LEGEND: SceneDef["legend"] = {
  g: { terrain: "grass" },
  d: { terrain: "dirt" },
  m: { terrain: "marble" },
};

export const FIELD_LEGEND: SceneDef["legend"] = {
  g: { terrain: "grass" },
  s: { terrain: "sand" },
};

export default make("telegraph-aims", "greece", DIRT, DIRT_LEGEND);
export const night = make("telegraph-aims-night", "field-night", FIELD, FIELD_LEGEND);
