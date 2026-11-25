import { type Doll, type Prop, scene } from "../scene.ts";

/**
 * classroom-break: 1학년 2반, 14:50, the ten minutes before 7교시. The desks are still pushed into
 * 모둠 fours from the morning's lab write-up, so half the class faces the room and half faces the
 * board. One has given up and is asleep on the desk; across from them two are reading, one is
 * stretching, and the window row is only pretending to study.
 */

const WALL_Y = 63;
const MOUNT_Y = WALL_Y + 1;

function wallRun(x0: number, x1: number, worn: readonly number[] = []): Prop[] {
  const out: Prop[] = [];
  for (let x = x0; x < x1; x += 16) {
    const frame = x === x0 ? "end-l" : x + 16 >= x1 ? "end-r" : worn.includes(x) ? "worn" : "run";
    out.push({ prop: "wall-cream", frame, at: [x, WALL_Y] });
  }
  return out;
}

/** Who sits where at a 모둠 of four, and what they are doing. Null is an empty seat. */
type Seat = { look: string; anim?: string; frame?: string } | null;

/**
 * Four desks pushed together: two on the far side whose students face us, two on the near side
 * whose students have their backs to us. `cy` is the line where the desks meet.
 */
function group(cx: number, cy: number, far: readonly Seat[], near: readonly Seat[], books: string) {
  const out: (Prop | Doll)[] = [];
  [-10, 10].forEach((dx, i) => {
    const x = cx + dx;
    const seat = far[i] ?? null;
    out.push({ prop: "school-chair", frame: "front", at: [x, cy - 22] });
    out.push({ prop: "school-desk", frame: i === 0 ? books : "none", at: [x, cy] });
    if (seat) {
      const asleep = seat.anim === "sleep";
      out.push({
        rig: "student",
        look: seat.look,
        dir: "down",
        ...(seat.frame
          ? { frame: seat.frame }
          : { anim: seat.anim ?? "sit", play: true, index: i }),
        // Head down on the desk: drawn after the desk, resting on its top.
        at: [x, asleep ? cy - 8 : cy - 19],
        ...(asleep ? { sort: cy + 1 } : {}),
      });
    }
  });
  [-10, 10].forEach((dx, i) => {
    const x = cx + dx;
    const seat = near[i] ?? null;
    out.push({ prop: "school-desk", frame: i === 1 ? books : "none", at: [x, cy + 16] });
    if (seat) {
      out.push({
        rig: "student",
        look: seat.look,
        dir: "up",
        ...(seat.frame
          ? { frame: seat.frame }
          : { anim: seat.anim ?? "sit", play: true, index: i + 2 }),
        at: [x, cy + 27],
      });
    }
    out.push({ prop: "school-chair", frame: "back", at: [x, cy + 31] });
  });
  return out;
}

export default scene({
  name: "classroom-break",
  seed: 1450,
  theme: "campus",
  sky: "ink.deep",
  legend: {
    "#": { terrain: "lino" },
    w: { terrain: "lino" },
  },
  ground: `
    ##############################
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwww
  `,
  edges: [{ overlay: "wall-top", inside: "#" }],
  objects: [
    ...wallRun(0, 480, [96, 256, 400]),
    { prop: "window", frame: "day", at: [32, MOUNT_Y] },
    { prop: "window", frame: "day-curtain", at: [80, MOUNT_Y] },
    { prop: "blackboard", frame: "written", at: [240, MOUNT_Y + 12] },
    { prop: "wall-clock", anim: "tick", play: true, at: [338, MOUNT_Y] },
    { prop: "notice", frame: "l", at: [376, MOUNT_Y] },
    { prop: "notice", frame: "a", at: [392, MOUNT_Y] },
    { prop: "notice", frame: "r", at: [408, MOUNT_Y] },
    { prop: "lockers", frame: "shut", at: [452, 92] },
    { prop: "teacher-desk", frame: "buried", at: [240, 118] },
    ...group(
      100,
      158,
      [{ look: "plaits", anim: "sleep" }, { look: "quiet" }],
      [{ look: "summer" }, { look: "buzzcut", anim: "stretch" }],
      "open",
    ),
    ...group(
      240,
      182,
      [{ look: "twins" }, { look: "gymbun", frame: "sit1" }],
      [{ look: "curls" }, { look: "reader" }],
      "books",
    ),
    ...group(
      380,
      158,
      [{ look: "quiff" }, null],
      [{ look: "bedhead", anim: "sleep" }, { look: "club" }],
      "books",
    ),
    // Up and about: one waving through the door, one with a delivery for the 교무실.
    { rig: "student", look: "blazer", dir: "down", anim: "wave", play: true, at: [452, 236] },
    { rig: "student", look: "gymbun", dir: "side", anim: "carry", play: true, at: [40, 238] },
    { prop: "bag", frame: "slump", at: [124, 236] },
    { prop: "bag", frame: "navy", at: [262, 258] },
  ],
});
