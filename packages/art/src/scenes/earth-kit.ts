import type { Prop } from "../scene.ts";
import { scene } from "../scene.ts";
import { crowd, fx, mob, student } from "./fight.ts";

/**
 * earth-kit: a class's whole kit judged together. 지구과학 is the class most at risk of going
 * under on Page 1: its amber is the nearest hue to sunlit Greek dirt, and all six of its books
 * work on the ground. Left of the field, one student fires the six launch books at once; right of
 * it, another fires the six evolved forms. The question is the combat scene's: in a crowd, can
 * every one of the twelve still be told apart, and does the evolved side look like a grander
 * thing at a glance?
 */

const BASE: [number, number] = [74, 150];
const EVOLVED: [number, number] = [336, 146];

/** A strip effect laid end to end along a line on the ground. */
const strip = (prop: string, x: number, y: number, tiles: number, more: Partial<Prop> = {}) =>
  Array.from({ length: tiles }, (_, i) => fx(prop, x + i * 48, y, more));

export default scene({
  name: "earth-kit",
  seed: 73,
  theme: "greece",
  legend: {
    g: { terrain: "grass" },
    d: { terrain: "dirt" },
    m: { terrain: "marble" },
  },
  ground: `
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
  `,
  details: [
    // Launch books, on the ground.
    ...strip("fx-fault", 104, 212, 2, { anim: "open", index: 2 }),
    fx("fx-forecast-ring", 192, 74, { anim: "warn", index: 3, play: true }),
    fx("fx-forecast-ring", 170, 250, { anim: "warn", index: 2, play: true }),
    fx("fx-crater", 128, 70, { frame: "c3" }),
    fx("atk-tide", BASE[0], BASE[1], { frame: "out48" }),
    fx("fx-rain", BASE[0] + 4, BASE[1] - 2, { anim: "fall", play: true }),
    fx("fx-lava", 206, 252, { anim: "burn", play: true }),
    // Evolved forms, on the ground.
    fx("fx-typhoon", EVOLVED[0], EVOLVED[1], { anim: "turn", play: true }),
    ...strip("evo-plate-tectonics", 250, 222, 2, { anim: "grind", play: true }),
    fx("evo-spring-tide", 430, 200, { frame: "out72" }),
    fx("evo-stratovolcano", 438, 254, { frame: "flow1", play: false }),
    fx("fx-forecast-ring", 412, 60, { anim: "warn", index: 3, play: true }),
    fx("fx-forecast-ring", 452, 92, { anim: "break", play: true }),
    fx("fx-forecast-ring", 386, 96, { anim: "warn", index: 2, play: true }),
  ],
  objects: [
    { prop: "column", frame: "whole", at: [470, 46] },
    { prop: "olive", at: [22, 40] },
    ...crowd(
      5,
      30,
      [96, 30, 236, 262],
      [
        [BASE[0], BASE[1], 40],
        [150, 212, 18],
        [192, 74, 22],
        [206, 252, 16],
      ],
    ),
    ...crowd(
      9,
      30,
      [248, 24, 476, 262],
      [
        [EVOLVED[0], EVOLVED[1], 40],
        [412, 60, 18],
        [438, 254, 26],
      ],
      14,
      (x) => x > EVOLVED[0],
    ),
    mob("odap", 194, 140, "hit"),
    mob("odap", 228, 132, "hit"),
    mob("element-fire", 112, 196, "hit"),
    mob("odap", 384, 138, "hit", 0, true),
    mob("rational", 410, 150, "hit", 0, true),
    student("bedhead", BASE[0], BASE[1], 2),
    student("summer", EVOLVED[0], EVOLVED[1], 1),
    { actor: "atk-vent", anim: "erupt", play: true, at: [196, 262] },
    { actor: "evo-stratovolcano", anim: "erupt", play: true, at: [438, 254] },
  ],
  overhead: [{ prop: "olive-crown", anim: "stir", play: true, at: [22, 40] }],
  atmosphere: [
    // 일기도 분석 노트 over the base student, its strike landing ahead of them.
    fx("atk-cloud", BASE[0], BASE[1] - 30, { anim: "drift", play: true }),
    fx("fx-thunder", 112, 196, { anim: "strike", play: true }),
    // 암석 표본 상자: three stones out to the right, one landing.
    fx("fx-rock", 104, 136, { anim: "igneous", play: true }),
    fx("fx-rock", 136, 132, { anim: "sedimentary", play: true, index: 1 }),
    fx("fx-rock", 166, 138, { anim: "metamorphic", play: true, index: 2 }),
    fx("fx-rock-hit", 194, 140, { anim: "sedimentary", index: 1, play: true }),
    fx("fx-shard", 132, 196, { anim: "tumble0", play: true }),
    fx("fx-shard", 176, 200, { anim: "tumble1", play: true }),
    // 천체 관측 일지: the meteor coming down on its mark.
    fx("atk-meteor", 200, 50, { anim: "fall", play: true }),
    // Statuses on the struck.
    fx("status", 112, 182, { anim: "wet", play: true }),
    fx("status", 194, 126, { anim: "slow", play: true }),
    fx("status", 228, 118, { anim: "burn", play: true }),
    // The evolved side: the typhoon's cloud and its lightning that never stops.
    fx("evo-typhoon-cloud", EVOLVED[0], EVOLVED[1] - 34, { anim: "drift", play: true }),
    fx("fx-thunder", 384, 138, { anim: "strike", play: true }),
    fx("fx-thunder", 300, 172, { anim: "strike", play: true, index: 1 }),
    // 암석의 순환 ricocheting through the pack.
    fx("evo-rock-cycle", 372, 126, { anim: "igneous", play: true }),
    fx("evo-rock-cycle", 404, 112, { anim: "sedimentary", play: true, index: 1 }),
    fx("fx-rock-hit", 410, 150, { anim: "metamorphic", index: 1, play: true }),
    // 유성우: the shower coming down on three marks.
    fx("atk-meteor", 420, 34, { anim: "small", play: true }),
    fx("atk-meteor", 458, 66, { anim: "small", play: true, index: 1 }),
    fx("atk-meteor", 394, 72, { anim: "small", play: true, index: 2 }),
    fx("status", 384, 124, { anim: "wet", play: true }),
    fx("status", 410, 132, { anim: "armor-break", play: true }),
  ],
});
