import { type Doll, type Light, type Prop, scene } from "../scene.ts";

/**
 * morning-assembly: 증명관 체육관, 08:10, the morning after the rift. On the stage under the
 * wine curtain the 교장 is announcing that the tear on the 운동장 is now the 방과후학교 programme
 * 「균열 탐사(심화)」, worth 20 percent of 수행평가; beside him 모 선생님 is already signing the
 * forms, and 권 사감 stands at the stage steps with her clipboard. The whole school stands in
 * rows facing the stage. The five class seniors are scattered through it: 석지안 and 한소율 at
 * the front corners, 배도윤 turned sideways tossing his book, 오여름 under her bucket hat,
 * 우태산 asleep on his feet at the back. In the second row 민가람 leans over to whisper to
 * 도현우 across the one empty place in the rows, 서하's. The 보건 선생님 watches from by the
 * door, the 조리사님 looks in from the corridor, and the cat sits on the edge of the stage.
 */

const WALL_Y = 63;
const MOUNT_Y = WALL_Y + 1;
const STAGE_X = 112;
const STAGE_W = 16;
const STAGE_FRONT = 107;

function wallRun(prop: string, x0: number, x1: number, worn: readonly number[] = []): Prop[] {
  const out: Prop[] = [];
  for (let x = x0; x < x1; x += 16) {
    const frame = x === x0 ? "end-l" : x + 16 >= x1 ? "end-r" : worn.includes(x) ? "worn" : "run";
    out.push({ prop, frame, at: [x, WALL_Y] });
  }
  return out;
}

/** The stage: sixteen pieces of boards and panelled front, a scuffed one where the podium goes. */
const stage: Prop[] = Array.from({ length: STAGE_W }, (_, i) => ({
  prop: "stage",
  frame: i === 0 ? "end-l" : i === STAGE_W - 1 ? "end-r" : i === 8 ? "worn" : "run",
  at: [STAGE_X + i * 16, STAGE_FRONT],
}));

const curtain: Prop[] = [
  ...Array.from({ length: STAGE_W }, (_, i) => ({
    prop: "stage-curtain",
    frame: "valance",
    at: [STAGE_X + i * 16, 16] as const,
  })),
  { prop: "stage-curtain", frame: "side-l", at: [STAGE_X, 16] },
  { prop: "stage-curtain", frame: "side-r", at: [STAGE_X + (STAGE_W - 1) * 16, 16] },
];

/** Morning through the high windows: a long pane falling across the floor. */
const sun = (cx: number, lean: number): Light => ({
  bands: ["campus"],
  spill: { top: [cx - 12, cx + 12, 66], bottom: [cx - 6 + lean, cx + 26 + lean, 150] },
  ragged: 2,
});

const COLS = [72, 104, 136, 168, 200, 232, 264, 296, 328, 360, 392];
const ROWS = [156, 186, 216, 246];
/** Mostly black and brown hair, the odd dyed head. */
const LOOKS = [
  "blazer",
  "reader",
  "summer",
  "blazer",
  "reader",
  "club",
  "blazer",
  "summer",
  "reader",
  "bedhead",
  "blazer",
  "summer",
  "reader",
  "curls",
];

/** Who stands where, by row and column. Everyone else is a student facing the stage. */
const CAST: Readonly<Record<string, Doll>> = {
  "0,0": { rig: "senior-math", look: "math", dir: "up", anim: "idle", play: true, at: [0, 0] },
  "0,10": { rig: "senior-chem", look: "chem", dir: "up", anim: "idle", play: true, at: [0, 0] },
  "1,4": { rig: "garam", look: "maker", dir: "side", anim: "chatter", play: true, at: [0, 0] },
  "1,5": { rig: "", at: [0, 0] },
  "1,6": { rig: "hyunwoo", look: "tired", dir: "up", anim: "idle", play: true, at: [0, 0] },
  "1,10": {
    rig: "senior-physics",
    look: "physics",
    dir: "side",
    anim: "idle",
    play: true,
    index: 3,
    flip: true,
    at: [0, 0],
  },
  "2,2": { rig: "senior-bio", look: "bio", dir: "up", anim: "idle", play: true, at: [0, 0] },
  "3,8": {
    rig: "senior-earth",
    look: "earth",
    dir: "up",
    anim: "idle",
    play: true,
    index: 2,
    at: [0, 0],
  },
};

/** Students who are not quite facing the stage: a yawn, a word to the next row, a page. */
const STUDENTS: Readonly<Record<string, Partial<Doll>>> = {
  "0,3": { anim: "yawn", index: 2 },
  "2,6": { dir: "side", flip: true },
  "2,7": { dir: "side" },
  "3,1": { dir: "down", anim: "page", index: 2 },
  "3,10": { anim: "yawn", index: 1 },
};

const rows: Doll[] = [];
ROWS.forEach((y, r) => {
  COLS.forEach((x, c) => {
    const jitter = ((r * 7 + c * 3) % 3) - 1;
    const who = CAST[`${r},${c}`];
    if (who) {
      if (who.rig) rows.push({ ...who, at: [x + jitter, y] });
      return;
    }
    const odd = STUDENTS[`${r},${c}`];
    rows.push({
      rig: "student",
      look: LOOKS[(r * 5 + c * 3) % LOOKS.length] as string,
      dir: "up",
      anim: "idle",
      play: true,
      index: (r + c) % 2,
      ...odd,
      at: [x + jitter, y + ((c + r) % 2)],
    });
  });
});

export default scene({
  name: "morning-assembly",
  seed: 810,
  theme: "campus-dusk",
  sky: "ink.deep",
  legend: {
    "#": { terrain: "wood" },
    w: { terrain: "wood" },
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
  details: [
    // Court lines on the boards, mostly under the rows.
    { prop: "court-line", frame: "h", at: [0, 130], repeat: 30 },
    { prop: "court-line", frame: "v", at: [239, 130], repeat: 1 },
    { prop: "court-line", frame: "v", at: [239, 146] },
    { prop: "court-line", frame: "v", at: [239, 162] },
    { prop: "court-line", frame: "v", at: [239, 178] },
    { prop: "court-line", frame: "v", at: [239, 194] },
    { prop: "court-line", frame: "v", at: [239, 210] },
    { prop: "court-line", frame: "v", at: [239, 226] },
    { prop: "court-line", frame: "v", at: [239, 242] },
    { prop: "court-line", frame: "v", at: [239, 258] },
    { prop: "court-ring", at: [240, 204] },
    ...stage,
    { prop: "stage-steps", at: [88, 109] },
  ],
  objects: [
    ...wallRun("wall-cream", 0, 480, [192, 336]),
    { prop: "window", frame: "day", at: [28, MOUNT_Y] },
    { prop: "window", frame: "day-curtain", at: [72, MOUNT_Y] },
    { prop: "window", frame: "day", at: [404, MOUNT_Y] },
    { prop: "door-double", frame: "open", at: [452, MOUNT_Y] },
    { prop: "exit-sign", at: [452, MOUNT_Y] },
    { prop: "wall-clock", frame: "s8", at: [404, MOUNT_Y - 34] },
    // On the stage: the 교장 mid-announcement behind the podium, 모 선생님 signing.
    {
      rig: "principal",
      look: "principal",
      dir: "down",
      anim: "announce",
      play: true,
      index: 3,
      at: [240, 80],
    },
    { prop: "gym-podium", at: [240, 87] },
    { rig: "mo", look: "teacher", dir: "down", anim: "idle", play: true, at: [176, 82] },
    { actor: "entropy", anim: "idle", play: true, at: [344, 92] },
    // At the side: 권 사감 at the steps, the 보건 선생님 by the door, the 조리사님 looking in.
    { rig: "sagam", look: "duty", dir: "side", anim: "idle", play: true, at: [70, 128] },
    {
      rig: "nurse",
      look: "nurse",
      dir: "side",
      anim: "idle",
      play: true,
      flip: true,
      at: [438, 122],
    },
    {
      rig: "head-cook",
      look: "cook",
      dir: "down",
      anim: "idle",
      play: true,
      index: 6,
      at: [453, 68],
    },
    ...rows,
  ],
  overhead: [...curtain, { prop: "school-banner", at: [240, 30] }],
  lights: [
    sun(28, -8),
    sun(72, -4),
    sun(404, 8),
    // The stage is lit from the front.
    { bands: ["campus"], at: [240, 80], r: [130, 26], ragged: 3 },
  ],
  atmosphere: [
    { actor: "mote", anim: "drift", play: true, at: [34, 96] },
    { actor: "mote", anim: "drift", play: true, index: 2, at: [70, 118] },
    { actor: "mote", anim: "drift", play: true, index: 1, at: [412, 104] },
    { actor: "mote", anim: "drift", play: true, index: 3, at: [196, 60] },
    { actor: "mote", anim: "drift", play: true, index: 2, at: [286, 54] },
  ],
});
