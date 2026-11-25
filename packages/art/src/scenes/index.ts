import type { SceneDef } from "../scene.ts";
import agoraRift from "./agora-rift.ts";
import campusNight from "./campus-night.ts";
import p1Croton from "./p1-croton.ts";
import p1Elea from "./p1-elea.ts";

/** Every scene on the contact sheet, in order. */
export const SCENES: readonly SceneDef[] = [campusNight, agoraRift, p1Croton, p1Elea];
