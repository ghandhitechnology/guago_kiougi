/**
 * The story's MapRoom messages (PLAN §4 opening, §10 shared progress, §15 story quests). The
 * server decides which scene a player sees, meets its `play` steps and ends it; the client
 * presents the steps in between and says when it is done. Scenes and their steps are content
 * (`stagingOf`, `sceneById`); only their ids travel.
 */
import type { MessageSchema } from "./messages.ts";

export const STORY_MESSAGES = {
  /** Server: present this scene. */
  scene: "scene",
  /** Server: a `play` step of the running scene is met. */
  cue: "cue",
  /** Server: the scene is over (a shared one ran its length, a replay was left). */
  end: "sceneEnd",
  /** Client: what it did with a scene (`StoryRequest`). */
  story: "story",
  /** Server: the personal story log, answering `log` (`StoryLog`). */
  log: "storyLog",
} as const;

/** Scenes a character can play again (복습): boss scenes its server has reached, beats it saw. */
export interface StoryLog {
  readonly scenes: readonly string[];
}

/** One showing of a scene to one client. */
export interface SceneStart {
  /** This showing's number, answered with in `done`, `walk` and `reach`. */
  readonly run: number;
  readonly scene: string;
  /** `play` steps already met: the scene resumes after the last of them. */
  readonly from: number;
  /** Everyone in the room sees it. */
  readonly shared: boolean;
  /** The player may cut it short. */
  readonly skip: boolean;
}

export interface SceneCue {
  readonly run: number;
  /** The condition met, as the scene's `play` step names it (`near:cooler`). */
  readonly until: string;
}

export interface SceneEnd {
  readonly run: number;
}

export type StoryRequest =
  /** The scene was presented to its end, or skipped where it may be. */
  | { readonly t: "done"; readonly run: number }
  /** The scene walks the player's own body to one of its marks over `ms`. */
  | { readonly t: "walk"; readonly run: number; readonly to: string; readonly ms: number }
  /** The scene reached its step `step` (a `system` step: the 벌점 it names lands with it). */
  | { readonly t: "reach"; readonly run: number; readonly step: number }
  /** Play a scene again from the story log (a 복습 replay). */
  | { readonly t: "replay"; readonly scene: string }
  /** The story log, for a replay object's list. */
  | { readonly t: "log" }
  /** Development servers only: a fight's hook was met (`clear:landing-3f`). */
  | { readonly t: "signal"; readonly until: string };

const ID = /^[a-z0-9:.-]{1,64}$/;
const isRun = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** `story` is one `StoryRequest`; a malformed one drops the client like any invalid message. */
export const storyMessage: MessageSchema<StoryRequest> = {
  "~standard": {
    version: 1,
    vendor: "guago",
    validate(value: unknown) {
      const bad = (message: string) => ({ issues: [{ message }] });
      if (typeof value !== "object" || value === null) return bad("story is an object");
      const v = value as Record<string, unknown>;
      switch (v.t) {
        case "done":
          return isRun(v.run) ? { value: { t: "done", run: v.run } } : bad("done needs a run");
        case "walk":
          if (!isRun(v.run) || typeof v.to !== "string" || !ID.test(v.to)) return bad("bad walk");
          if (!Number.isInteger(v.ms) || (v.ms as number) < 0 || (v.ms as number) > 20_000)
            return bad("walk ms");
          return { value: { t: "walk", run: v.run, to: v.to, ms: v.ms as number } };
        case "reach":
          if (!isRun(v.run) || !Number.isInteger(v.step) || (v.step as number) < 0)
            return bad("bad reach");
          return { value: { t: "reach", run: v.run, step: v.step as number } };
        case "log":
          return { value: { t: "log" } };
        case "replay":
          return typeof v.scene === "string" && ID.test(v.scene)
            ? { value: { t: "replay", scene: v.scene } }
            : bad("bad replay");
        case "signal":
          return typeof v.until === "string" && ID.test(v.until)
            ? { value: { t: "signal", until: v.until } }
            : bad("bad signal");
        default:
          return bad("unknown story request");
      }
    },
  },
};
