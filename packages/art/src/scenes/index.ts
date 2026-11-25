import type { SceneDef } from "../scene.ts";
import agoraRift from "./agora-rift.ts";
import cafeteriaNoon from "./cafeteria-noon.ts";
import campusNight from "./campus-night.ts";
import combat from "./combat.ts";
import makerRoom from "./maker-room.ts";
import studyRoomNight from "./study-room-night.ts";

/** Every scene on the contact sheet, in order. */
export const SCENES: readonly SceneDef[] = [
  campusNight,
  agoraRift,
  combat,
  studyRoomNight,
  makerRoom,
  cafeteriaNoon,
];
