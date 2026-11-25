/**
 * The school around a scene: students asleep and studying at the 자습실's carrels at 23:38, the
 * whole school in rows in the 체육관 for the morning assembly. Student rigs with their poses,
 * drawn and sorted like everyone else, and gone with the map.
 */
import type { ArtMetadata } from "@guago/art";
import type * as Phaser from "phaser";
import { composeLook, lookAnim, lookTexture, spriteAnim } from "../art.ts";
import type { Stage } from "./stage.ts";

const RIG = "student";
const PODIUM = "gym-podium";

/** A student at (x, y), facing `dir`, in a pose. */
function student(
  stage: Stage,
  meta: ArtMetadata,
  look: string,
  x: number,
  y: number,
  dir: "up" | "down" | "side",
  pose: string,
  flip = false,
): Phaser.GameObjects.Sprite | undefined {
  const { scene, view } = stage.host;
  const rig = meta.rigs[RIG];
  if (!rig?.looks[look]) return undefined;
  const key = lookTexture(RIG, look);
  if (!scene.textures.exists(key)) composeLook(scene, meta, RIG, look);
  const s = scene.add.sprite(Math.round(x), Math.round(y), key);
  const anim = rig.anims[pose] ? pose : "idle";
  s.play(lookAnim(RIG, look, dir, anim));
  s.anims.setProgress(Math.random());
  s.setFlipX(flip);
  view.addEntity(s);
  return s;
}

/** The scenes that fill their room, by scene id. */
const FILLS: Readonly<Record<string, (stage: Stage) => Phaser.GameObjects.Sprite[]>> = {
  "opening-b1": studyHall,
  "opening-b2": studyHall,
  "opening-b3": studyHall,
  "opening-b7": assembly,
};

/** Fills the room for a scene, once per map visit (beats on one map share their people). */
export function fillRoom(stage: Stage, sceneId: string): void {
  const fill = FILLS[sceneId];
  if (!fill) return;
  const key = fill.name;
  if (stage.extras.has(key)) return;
  stage.extras.set(key, fill(stage));
}

/**
 * 23:38 in the 4층 자습실: most carrels taken, half the room asleep on their books, a few still
 * writing; the player's own chair is the one at the `seat` mark.
 */
function studyHall(stage: Stage): Phaser.GameObjects.Sprite[] {
  const { map, meta } = stage.host;
  const looks = Object.keys(meta.rigs[RIG]?.looks ?? {});
  const seat = map.marks.seat;
  const chairs = map.scene.objects
    .filter((o) => "prop" in o && o.prop === "study-chair")
    .map((o) => ({ x: o.at[0], y: o.at[1] }));
  const out: Phaser.GameObjects.Sprite[] = [];
  chairs.forEach((c, i) => {
    // The player's chair, and a few left empty: it is late.
    if (seat && Math.hypot(c.x - seat.x, c.y - seat.y) < 16) return;
    if (i % 5 === 3 || i % 7 === 6) return;
    const look = looks[(i * 7 + 3) % looks.length] as string;
    const pose = i % 3 === 0 ? "sit" : "sleep";
    const s = student(stage, meta, look, c.x + 8, c.y + 2, "up", pose);
    if (s) out.push(s);
  });
  return out;
}

/**
 * 08:40 in the 체육관: the school in rows facing the stage, the odd head turned to whisper, one
 * place in the second row empty (서하's). The player stands in their row at the `rows` mark.
 */
function assembly(stage: Stage): Phaser.GameObjects.Sprite[] {
  const { map, meta } = stage.host;
  const looks = Object.keys(meta.rigs[RIG]?.looks ?? {});
  const at = map.marks.rows;
  if (!at) return [];
  const out: Phaser.GameObjects.Sprite[] = [];
  // The podium the 교장 speaks from, just in front of where the scene stands him.
  const stageMark = map.marks.stage;
  const podium = stageMark && meta.sprites[PODIUM];
  if (stageMark && podium && stage.host.scene.textures.exists(podium.atlas)) {
    const s = stage.host.scene.add.sprite(stageMark.x, stageMark.y + 22, podium.atlas);
    s.play(spriteAnim(PODIUM, "idle"));
    stage.host.view.addEntity(s, { shadow: false });
    out.push(s);
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 11; c++) {
      const x = at.x + (c - 5) * 32 + (((r * 7 + c * 3) % 3) - 1);
      const y = at.y - 52 + r * 26;
      // The player's place, and 서하's.
      if (Math.abs(x - at.x) < 12 && Math.abs(y - at.y) < 14) continue;
      if (r === 1 && c === 6) continue;
      const look = looks[(r * 5 + c * 3) % looks.length] as string;
      const turned = (r * 11 + c) % 9 === 4;
      const pose = (r * 11 + c) % 13 === 5 ? "sleepy" : "idle";
      const s = student(stage, meta, look, x, y, turned ? "side" : "up", pose, c % 2 === 0);
      if (s) out.push(s);
    }
  }
  return out;
}
