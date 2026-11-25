import { type Actor, type Doll, type Prop, scene } from "../scene.ts";

/**
 * p1-lyceum: 리케이온, week ten, the first 논제. 아리스토텔레스 lectures from his drum at the head
 * of the colonnade, a boulder in one hand and a feather in the other, the four spheres tilted and
 * hung with stones behind him, the gold 반론 불가 dome over everything. Boulders are coming down
 * on short, dark marks and feathers on wide faint ones. The class breaks the two thesis steles
 * that feed his shield while the rest dodge. In the corners the element zones wait for the
 * second 논제, and across the bottom of the floor a strip of ice is already frosting over for the
 * fourth, the block sitting at its end.
 */

const AT = [240, 150] as const;
const boss = (part: string, anim: string): Actor => ({
  actor: `boss-aristotle-${part}`,
  anim,
  play: true,
  at: AT,
});

const student = (
  look: string,
  at: readonly [number, number],
  anim: string,
  dir: "down" | "up" | "side" = "side",
  flip = false,
  index = 0,
): Doll => ({ rig: "student", look, dir, anim, play: true, index, at, flip });

/** A boulder on its way down over its mark: the mark on the ground, the stone above it. */
const drop = (x: number, y: number, stage: number, height: number): (Prop | Actor)[] => [
  { prop: "p1-fall-mark", frame: `boulder${stage}`, at: [x, y], raw: true },
  { actor: "p1-boulder", anim: "fall", play: true, at: [x, y - height] },
];
const drift = (x: number, y: number, height: number, index: number): (Prop | Actor)[] => [
  { prop: "p1-fall-mark", anim: "feather", play: true, index, at: [x, y], raw: true },
  { actor: "p1-feather", anim: "drift", play: true, index, at: [x, y - height] },
];

const column = (x: number, y: number): Prop[] => [
  { prop: "column", frame: "whole", at: [x, y] },
  { prop: "column-capital", at: [x, y] },
];
const stoa = [24, 72, 120, 360, 408, 456].flatMap((x) => column(x, 64));

const ice: Prop[] = [0, 1, 2, 3, 4, 5].map((k) => ({
  prop: "p1-ice",
  frame: "frost",
  at: [176 + k * 32, 222],
  raw: true,
}));

const marks = [...drop(132, 214, 3, 40), ...drop(312, 196, 2, 70), ...drop(384, 244, 1, 110)];
const feathers = [...drift(180, 190, 60, 0), ...drift(420, 176, 80, 2), ...drift(60, 196, 50, 1)];

export default scene({
  name: "p1-lyceum",
  seed: 31,
  theme: "greece",
  legend: {
    m: { terrain: "marble" },
    d: { terrain: "dirt" },
    g: { terrain: "grass" },
  },
  ground: `
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    ddddddddmmmmmmmmmmmmmmdddddddd
    dddddddddmmmmmmmmmmmmddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    gddddddddddddddddddddddddddddg
    gddddddddddddddddddddddddddddg
    ggdddddddddddddddddddddddddddg
    ggdddddddddddddddddddddddddddg
    gddddddddddddddddddddddddddddg
    ggdddddddddddddddddddddddddddg
    gggddddddddddddddddddddddddggg
    gggggddddddddddddddddddddggggg
  `,
  details: [
    // The four natural places, waiting for the second 논제.
    { prop: "p1-zone-air", frame: "dormant", at: [70, 110], raw: true },
    { prop: "p1-zone-fire", frame: "dormant", at: [410, 110], raw: true },
    { prop: "p1-zone-earth", frame: "dormant", at: [70, 246], raw: true },
    { prop: "p1-zone-water", frame: "dormant", at: [410, 246], raw: true },
    ...ice,
    ...marks.filter((m) => "prop" in m),
    ...feathers.filter((m) => "prop" in m),
  ],
  objects: [
    ...stoa.filter((c) => c.prop === "column"),
    { prop: "olive", at: [150, 68] },
    { prop: "olive", at: [334, 66] },
    boss("halo", "weight"),
    boss("plinth", "still"),
    boss("body", "stand"),
    boss("arms", "scale"),
    boss("head", "lecture"),
    boss("lectern", "idle"),
    boss("shield", "crack1"),
    { actor: "p1-stele", frame: "t1-cracked", at: [146, 176] },
    { actor: "p1-stele", frame: "t1", at: [336, 176] },
    { actor: "p1-block", frame: "still", at: [176, 238] },
    // Breaking the steles.
    student("club", [126, 182], "attack", "side", false, 1),
    student("curls", [166, 186], "attack", "side", true, 2),
    student("bedhead", [358, 182], "attack", "side", true, 0),
    // Clear of the marks, or not.
    student("summer", [132, 222], "hit", "down"),
    student("reader", [282, 206], "walk", "side", true),
    student("blazer", [222, 192], "idle", "up"),
    student("summer", [400, 214], "walk", "down", false, 1),
    student("club", [96, 162], "walk", "side", true, 2),
    student("reader", [258, 252], "idle", "up"),
    student("curls", [450, 196], "attack", "side", true, 3),
  ],
  overhead: [
    ...stoa.filter((c) => c.prop === "column-capital"),
    { prop: "olive-crown", anim: "stir", play: true, at: [150, 68] },
    { prop: "olive-crown", anim: "stir", play: true, at: [334, 66] },
  ],
  // What is still falling draws over everything.
  atmosphere: [...marks, ...feathers].filter((m): m is Actor => "actor" in m),
});
