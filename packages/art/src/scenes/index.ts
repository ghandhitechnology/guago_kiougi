import type { SceneDef } from "../scene.ts";
import agoraRift from "./agora-rift.ts";
import campusNight from "./campus-night.ts";
import makerRoom from "./maker-room.ts";
import studyRoomNight from "./study-room-night.ts";

/** Every scene on the contact sheet, in order. */
export const SCENES: readonly SceneDef[] = [campusNight, agoraRift, studyRoomNight, makerRoom];
