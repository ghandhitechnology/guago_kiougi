import { type Actor, type Doll, type Prop, type SceneDef, scene } from "../scene.ts";
import { MARK, SPOT, WINDOW as TOWN } from "./p1-agora-town.ts";

/**
 * p1-agora-people: the 아고라 at 15:10 with its people in it, on a window of the real map. The
 * townspeople whose work has a mark here stand on it (the barber and his dozing customer, the
 * cook, the two arguers, the potter at his wheel, the order under the vines, the order's
 * youngest), and the rest are brought into this one screen: the water-carrier coming down from
 * the krene, the old man asleep under the olive by the dog, the sophist and his audience, the
 * messenger running through, the children with their hoop, the fish seller on the paving, the
 * two other helpers mid-escort, and the freed minds: 아리스타르코스 chalking his orbit again,
 * 제논 halfway through a gesture, 아리스토텔레스 writing down what the sophist got right.
 */

type Dir = "down" | "up" | "side";

const at = (name: string, dx = 0, dy = 0): readonly [number, number] => {
  const m = MARK[name];
  if (!m) throw new Error(`p1-agora-people: no mark ${name} in the window`);
  return [m[0] + dx, m[1] + dy];
};
const spot = (speaker: string): readonly [number, number] => {
  const s = SPOT.find((n) => n.speaker === speaker);
  if (!s) throw new Error(`p1-agora-people: no spot for ${speaker}`);
  return s.at;
};

const doll = (
  rig: string,
  where: readonly [number, number],
  anim: string,
  dir: Dir = "down",
  flip = false,
  index = 0,
  look = "town",
): Doll => ({ rig, look, dir, anim, play: true, index, at: where, flip });

const people: (Doll | Actor | Prop)[] = [
  // Beside the vines: the order, breathing in step, the middle one watching the bean sack.
  {
    actor: "pythagorean-order",
    anim: "idle",
    play: true,
    at: [spot("pythagoreans")[0] - 56, spot("pythagoreans")[1]],
    flip: true,
  },
  doll("pythagorean-junior", at("pythagorean-junior"), "idle", "down", false, 1),

  // The argument about the tear, one jabbing at it and one counting.
  doll("agora-pointer", at("argument-a"), "idle", "side"),
  doll("agora-counter", at("argument-b"), "idle", "side", true, 1),
  doll("zeno-campus", [200, 98], "half", "side", false, 0, "polite"),

  // The krene: the water-carrier coming down with a full jar.
  {
    rig: "agora-water",
    look: "town",
    dir: "down",
    anim: "walk",
    play: true,
    at: at("fountain", 8, 4),
    drift: { to: at("fountain", 32, 98), period: 9 },
  },
  doll("agora-fishmonger", [340, 100], "idle", "down", false, 2),

  // The olive's shade: the old man and the dog, both asleep.
  doll("agora-sleeper", [364, 58], "idle"),
  { prop: "sleeping-dog", anim: "breathe", play: true, at: [384, 62] },

  // 아리스타르코스 chalking the orbit in the dust where everyone walks.
  doll("aristarchus-campus", [418, 104], "chalk", "down", false, 2, "measuring"),

  // The sophist and his paying audience, and one who is not paying but is writing it all down.
  doll("agora-sophist", [52, 84], "idle", "down", false, 1),
  doll("crowd-a", [38, 110], "idle", "up"),
  doll("crowd-c", [62, 112], "idle", "up", false, 1),
  doll("crowd-b", [84, 100], "idle", "side", true, 2),
  doll("aristotle-campus", [108, 92], "jot", "side", true, 0, "lecturer"),

  // The street: the cook, the barber's chair, the potter at his wheel.
  doll("agora-cook", at("cook"), "idle", "down", false, 1),
  doll("agora-customer", at("barber", -23, -2), "idle"),
  doll("agora-barber", at("barber"), "idle", "side", true),
  doll("agora-potter", at("potter", 6, 10), "idle", "side", true),

  // Passing through: the messenger, the children, two helpers on their way out and back.
  {
    rig: "agora-messenger",
    look: "town",
    dir: "side",
    anim: "walk",
    play: true,
    flip: true,
    at: [360, 222],
    drift: { to: [-20, 222], period: 5 },
  },
  {
    actor: "agora-children",
    anim: "idle",
    play: true,
    at: [30, 262],
    drift: { to: [190, 262], period: 7 },
  },
  doll("lyceum-scribe", [282, 250], "relief", "down", false, 0),
  doll("survey-helper", [326, 252], "scared", "side", true, 2),
];

export default scene({
  ...(TOWN as unknown as SceneDef),
  name: "p1-agora-people",
  seed: 1510,
  objects: [...TOWN.objects, ...people],
});
