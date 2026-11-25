import { type Actor, type Doll, scene } from "../scene.ts";

/**
 * p1-cast-lineup: everyone in Page 1 twice, on the 아고라's two grounds, so each is judged where
 * they will stand: three rows on pale marble paving above, the same three rows on orange dust
 * below. Rigs in their idle, the groups and the spectators in the last row of each.
 */

const RIGS: readonly (readonly [rig: string, look: string])[] = [
  ["aristotle-campus", "lecturer"],
  ["zeno-campus", "polite"],
  ["pythagorean-campus", "first"],
  ["pythagorean-bean", "wary"],
  ["aristarchus-campus", "measuring"],
  ["pythagorean-junior", "town"],
  ["lyceum-scribe", "town"],
  ["survey-helper", "town"],
  ["guard", "patrol"],
  ["agora-potter", "town"],
  ["agora-barber", "town"],
  ["agora-customer", "town"],
  ["agora-cook", "town"],
  ["agora-pointer", "town"],
  ["agora-counter", "town"],
  ["agora-fishmonger", "town"],
  ["agora-water", "town"],
  ["agora-sleeper", "town"],
  ["agora-sophist", "town"],
  ["agora-messenger", "town"],
  ["crowd-a", "town"],
  ["crowd-b", "town"],
  ["crowd-c", "town"],
];

const SPRITES: readonly (readonly [sprite: string, x: number])[] = [
  ["pythagorean-order", 44],
  ["agora-children", 124],
  ["spectator-sit-a", 188],
  ["spectator-sit-b", 220],
  ["spectator-sit-c", 252],
  ["spectator-stand-a", 284],
  ["spectator-stand-b", 316],
];

function rows(top: number): (Doll | Actor)[] {
  return [
    ...RIGS.map(([rig, look], i): Doll => ({
      rig,
      look,
      dir: "down",
      anim: "idle",
      play: true,
      index: i % 3,
      at: [20 + (i % 12) * 40, top + (i < 12 ? 38 : 82)],
    })),
    ...SPRITES.map(
      ([actor, x], i): Actor => ({ actor, anim: "idle", play: true, index: i, at: [x, top + 126] }),
    ),
  ];
}

export default scene({
  name: "p1-cast-lineup",
  seed: 1511,
  theme: "greece",
  legend: { m: { terrain: "marble" }, d: { terrain: "dirt" } },
  ground: `
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
  `,
  objects: [...rows(0), ...rows(136)],
});
