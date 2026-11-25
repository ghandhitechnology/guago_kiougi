import type { SceneDef } from "../scene.ts";
import agoraRift from "./agora-rift.ts";
import cafeteriaNoon from "./cafeteria-noon.ts";
import campusNight from "./campus-night.ts";
import classroomBreak from "./classroom-break.ts";
import combat from "./combat.ts";
import earthKit from "./earth-kit.ts";
import evolvedHorde from "./evolved-horde.ts";
import greekHorde from "./greek-horde.ts";
import makerRoom from "./maker-room.ts";
import morningAssembly from "./morning-assembly.ts";
import p1AgoraPeople from "./p1-agora-people.ts";
import p1CastLineup from "./p1-cast-lineup.ts";
import p1CaveGuards from "./p1-cave-guards.ts";
import p1Croton from "./p1-croton.ts";
import p1Elea from "./p1-elea.ts";
import p1Lyceum from "./p1-lyceum.ts";
import round2Kit, { night as round2KitNight } from "./round2-kit.ts";
import studyRoomNight from "./study-room-night.ts";
import telegraphAims, { night as telegraphAimsNight } from "./telegraph-aims.ts";
import telegraphRadii, { night as telegraphRadiiNight } from "./telegraph-radii.ts";

/** Every scene on the contact sheet, in order. */
export const SCENES: readonly SceneDef[] = [
  campusNight,
  agoraRift,
  combat,
  earthKit,
  evolvedHorde,
  telegraphAims,
  telegraphAimsNight,
  telegraphRadii,
  telegraphRadiiNight,
  round2Kit,
  round2KitNight,
  greekHorde,
  studyRoomNight,
  makerRoom,
  cafeteriaNoon,
  classroomBreak,
  p1Croton,
  p1AgoraPeople,
  p1CaveGuards,
  p1CastLineup,
  p1Elea,
  p1Lyceum,
  morningAssembly,
];
