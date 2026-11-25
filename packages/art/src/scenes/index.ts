import type { SceneDef } from "../scene.ts";
import agoraRift from "./agora-rift.ts";
import cafeteriaNoon from "./cafeteria-noon.ts";
import campusNight from "./campus-night.ts";
import combat from "./combat.ts";
import greekHorde from "./greek-horde.ts";
import makerRoom from "./maker-room.ts";
import morningAssembly from "./morning-assembly.ts";
import studyRoomNight from "./study-room-night.ts";

/** Every scene on the contact sheet, in order. */
export const SCENES: readonly SceneDef[] = [
  campusNight,
  agoraRift,
  combat,
  greekHorde,
  studyRoomNight,
  makerRoom,
  cafeteriaNoon,
  morningAssembly,
];
