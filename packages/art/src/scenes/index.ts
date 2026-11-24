import type { SceneDef } from "../scene.ts";
import agoraRift from "./agora-rift.ts";
import campusNight from "./campus-night.ts";

/** Every scene on the contact sheet, in order. */
export const SCENES: readonly SceneDef[] = [campusNight, agoraRift];
