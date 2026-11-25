import { type Doll, type Light, type SceneDef, scene } from "../scene.ts";
import { SPOT, WINDOW } from "./p1-cave-gate.ts";

/**
 * p1-cave-guards: the shadow cave's gate hall in its own dark, the guards on their rounds. The
 * one at the gate stands on his spot; one walks the gate route's lower leg and one its upper leg,
 * each torch held out the way he walks; one has just seen a student slipping past the boulder and
 * goes stiff with the `alert`; one has a student by the collar on the way to the exit. Every
 * torch lights the rock around it in two steps, so the guards are judged where players will meet
 * them: in the dark with fire in hand. The client draws their cones of sight itself, cut by the
 * walls, so the scene leaves them out.
 */

type Dir = "down" | "up" | "side";

/** Where his torch flame is, by direction and pose, from his feet. */
const FLAME: Record<Dir, readonly [number, number]> = {
  down: [-7, -16],
  up: [7, -18],
  side: [9, -17],
};

/** A wall torch: a warm core falling off to ember. */
const TORCH = ["dusk-fire", "rift-ember"];
/** A carried torch is smaller and swings, so its pool stays at the ember step. */
const HELD = ["rift-ember"];

const guard = (
  at: readonly [number, number],
  dir: Dir,
  pick: { anim?: string; frame?: string },
  flip = false,
  index = 0,
): Doll => ({ rig: "guard", look: "patrol", dir, ...pick, play: true, index, at, flip });

/** The torchlight a guard carries, on the ground around him. */
const carried = (at: readonly [number, number], dir: Dir, flip = false): Light => {
  const [fx, fy] = FLAME[dir];
  return { bands: HELD, at: [at[0] + (flip ? -fx : fx), at[1] + fy + 14], r: [40, 26], ragged: 4 };
};

const gate = SPOT.find((s) => s.speaker === "guard")?.at ?? [280, 220];
const lower: readonly [number, number] = [392, 200];
const upper: readonly [number, number] = [150, 88];
const alert: readonly [number, number] = [196, 152];
const caught: readonly [number, number] = [200, 248];

const people: Doll[] = [
  guard(gate, "down", { anim: "idle" }),
  guard(lower, "side", { anim: "walk" }, false, 1),
  guard(upper, "side", { anim: "walk" }, true, 3),
  guard(alert, "side", { frame: "alert1" }),
  { rig: "student", look: "summer", dir: "side", anim: "walk", play: true, at: [236, 140] },
  guard(caught, "side", { frame: "catch0" }, true),
  { rig: "student", look: "bedhead", dir: "side", frame: "hit", at: [186, 250], flip: true },
];

/** The map's wall torches, and the daylight coming in at the exit. */
const fixed: Light[] = [
  { bands: TORCH, at: [168, 86], r: [56, 40], ragged: 4 },
  { bands: TORCH, at: [328, 86], r: [56, 40], ragged: 4 },
  { bands: TORCH, at: [200, 214], r: [56, 40], ragged: 4 },
  { bands: TORCH, at: [296, 214], r: [56, 40], ragged: 4 },
  { bands: ["greece-dusk"], at: [240, 290], r: [96, 40], ragged: 5 },
];

export default scene({
  ...(WINDOW as unknown as SceneDef),
  name: "p1-cave-guards",
  seed: 2602,
  objects: [...WINDOW.objects, ...people],
  lights: [
    ...fixed,
    carried(gate, "down"),
    carried(lower, "side"),
    carried(upper, "side", true),
    carried(alert, "side"),
    carried(caught, "side", true),
  ],
});
