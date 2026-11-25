/**
 * How the narrative's scenes are staged (PLAN §4 opening, §10 shared progress, §15 story quests)
 * and the step interpreter the server and the client share. The narrative's words and steps are
 * untouched: this says only which built map a scene plays on, where the player stands when one
 * opens a map, who sees it, whether it plays in a private copy of its map, whether it may be
 * skipped, and where its cast stands before they first move. The interpreter says where a scene
 * resumes after its n-th `play`, what the stage looks like there, and how long it runs.
 */
import type { BuiltMap } from "./maps/format.ts";
import { NARRATIVE } from "./narrative/index.ts";
import type {
  Cutscene,
  Dir,
  Effect,
  Line,
  Milestone,
  Music,
  Step,
  StoryBeat,
} from "./narrative/schema.ts";

/** Story places that are no built map or room of their own, staged on the map that shows them. */
export const STAGE_MAPS: Readonly<Record<string, string>> = {
  // The 운동장 is 23:40 forever; the morning after has no map of its own yet.
  "field-night": "campus-field",
  "field-day": "campus-field",
};

/**
 * The built map a scene or beat at `place` plays on: a map of that id, the map holding a room
 * zone of that id, or the map `STAGE_MAPS` names.
 */
export function stageMapOf(maps: readonly BuiltMap[], place: string): BuiltMap | undefined {
  const id = STAGE_MAPS[place] ?? place;
  return (
    maps.find((m) => m.id === id) ??
    maps.find((m) => m.zones.some((z) => z.kind === "room" && z.id === id))
  );
}

export interface Staging {
  /** Mark the player is put at when the scene opens its map (an opening beat, a replay). */
  readonly start?: string;
  /** Everyone in the room sees it; otherwise only the player it is for. */
  readonly shared: boolean;
  /** Played in a private copy of its map (the opening, the 집, a 복습 replay). */
  readonly instance: boolean;
  /** The player may cut it short. */
  readonly skip: boolean;
  /**
   * Where cast members stand when the scene starts, by mark, for those with no spot of their own
   * on the map; `@player` stands them beside the player. Monsters come with the effects that
   * bring them (`odap-surge`, `golem-rise`).
   */
  readonly enter: Readonly<Record<string, string>>;
}

const personal = (o: Partial<Staging> = {}): Staging => ({
  shared: false,
  instance: false,
  skip: false,
  enter: {},
  ...o,
});

const STAGING: Readonly<Record<string, Staging>> = {
  "opening-b1": personal({ instance: true, start: "seat" }),
  "opening-b2": personal({ instance: true }),
  "opening-b3": personal({ instance: true, enter: { entropy: "window" } }),
  "opening-b4": personal({ instance: true, start: "landing-4f", enter: { entropy: "@player" } }),
  "opening-b5": personal({
    instance: true,
    start: "field-edge",
    enter: { entropy: "@player", tortoise: "rift", aristotle: "lectern" },
  }),
  "opening-b6": personal({
    instance: true,
    enter: {
      entropy: "@player",
      tortoise: "tortoise-path",
      aristotle: "lectern",
      sagam: "dorm",
      "senior-physics": "@player",
    },
  }),
  "opening-b7": personal({ instance: true, start: "rows" }),
  "opening-b8": personal({ instance: true, start: "field-edge" }),
  "p1-pythagoreans-freed": {
    shared: true,
    instance: false,
    skip: true,
    enter: { pythagoreans: "grid-center", entropy: "@player", "senior-math": "@player" },
  },
  "p1-zeno-freed": {
    shared: true,
    instance: false,
    skip: true,
    enter: { zeno: "zeno", tortoise: "tortoise", entropy: "@player" },
  },
  "p1-aristotle-freed": {
    shared: true,
    instance: false,
    skip: true,
    enter: {
      aristotle: "lectern",
      aristarchus: "far-edge",
      block: "block-start",
      entropy: "@player",
    },
  },
  "expel-home": personal({ instance: true, start: "door" }),
};

/** Scenes whose cast lists `player` play with the player's own body; a beat's lines have none. */
export function stagingOf(id: string): Staging {
  return STAGING[id] ?? personal();
}

// Scenes ---------------------------------------------------------------------------------------

/** A story beat's lines as a scene: talk at its place, no staging. */
function beatScene(beat: StoryBeat): Cutscene {
  return { id: beat.id, map: beat.map, cast: [], marks: [], steps: beat.lines ?? [] };
}

/** Every scene the story plays: the opening's beats, the cutscenes and the beats with lines. */
export const SCENES: readonly Cutscene[] = [
  ...NARRATIVE.opening.map((b) => b.scene),
  ...NARRATIVE.cutscenes,
  ...NARRATIVE.story.filter((b) => (b.lines?.length ?? 0) > 0).map(beatScene),
];

const byId = new Map(SCENES.map((s) => [s.id, s]));

export function sceneById(id: string): Cutscene | undefined {
  return byId.get(id);
}

/** The opening's scenes in order (PLAN §4 "Opening sequence"). */
export const OPENING_SCENES: readonly string[] = NARRATIVE.opening.map((b) => b.scene.id);

/** The beat a cutscene belongs to, for the milestone that unlocks it. */
export function beatOfScene(id: string): StoryBeat | undefined {
  return NARRATIVE.story.find((b) => b.id === id || b.cutscene === id);
}

/** The milestone from which a story scene can play, or undefined for the opening and the 집. */
export function sceneFrom(id: string): Milestone | undefined {
  return beatOfScene(id)?.after;
}

// The interpreter ------------------------------------------------------------------------------

type Play = Extract<Step, { do: "play" }>;

/** Step indices of a scene's `play` steps, in order. */
export function playSteps(scene: Cutscene): number[] {
  return scene.steps.flatMap((s, i) => (s.do === "play" ? [i] : []));
}

/** The condition of a scene's n-th `play` step (0-based), or undefined past its last. */
export function playCondition(scene: Cutscene, n: number): Play | undefined {
  const i = playSteps(scene)[n];
  return i === undefined ? undefined : (scene.steps[i] as Play);
}

/**
 * The step a scene resumes at once `done` of its `play` steps have been met: the one after the
 * last met, else the first. A reload, a reconnection or a door lands there, never further back.
 */
export function resumeIndex(scene: Cutscene, done: number): number {
  if (done <= 0) return 0;
  const plays = playSteps(scene);
  const last = plays[Math.min(done, plays.length) - 1];
  return last === undefined ? 0 : last + 1;
}

/** Effects that leave the stage changed until something undoes them, by what undoes them. */
const LASTING: Partial<Record<Effect, Effect | null>> = {
  "lights-out": null,
  "rift-column": null,
  "columns-rise": null,
  "book-glow": null,
  "freeze-field": "unfreeze-field",
  "odap-surge": null,
  "golem-rise": null,
  "ice-spread": null,
  "limit-rings": null,
  "diagonal-glow": "grid-dissolve",
};

export interface Settled {
  /** The last music asked for: a track, null for silence, undefined when the scene set none. */
  readonly music: Music | null | undefined;
  /** Lasting effects still in place, with the mark each was played at. */
  readonly fx: readonly { readonly fx: Effect; readonly at?: string }[];
  /** The mark each actor last moved to. */
  readonly at: Readonly<Record<string, string>>;
  readonly facing: Readonly<Record<string, Dir>>;
  /** The mark the camera last went to. */
  readonly camera: string | undefined;
  /** The screen is faded out. */
  readonly dark: boolean;
  /** Talks offered at a spot and still open (until the next `play` is met). */
  readonly offers: readonly Extract<Step, { do: "offer" }>[];
}

/** What the stage looks like just before step `upTo`, every step before it played at once. */
export function settle(scene: Cutscene, upTo: number): Settled {
  let music: Music | null | undefined;
  let fx: { fx: Effect; at?: string }[] = [];
  const at: Record<string, string> = {};
  const facing: Record<string, Dir> = {};
  let camera: string | undefined;
  let dark = false;
  let offers: Extract<Step, { do: "offer" }>[] = [];
  for (const step of scene.steps.slice(0, upTo)) {
    switch (step.do) {
      case "music":
        music = step.track;
        break;
      case "move":
        at[step.actor] = step.to;
        break;
      case "face":
        facing[step.actor] = step.dir;
        break;
      case "camera":
        camera = step.to;
        break;
      case "offer":
        offers.push(step);
        break;
      case "play":
        offers = [];
        break;
      case "fx": {
        if (step.fx === "fade-out") dark = true;
        if (step.fx === "fade-in") dark = false;
        if (step.fx in LASTING) {
          fx.push(step.at === undefined ? { fx: step.fx } : { fx: step.fx, at: step.at });
        }
        const undone = Object.entries(LASTING).find(([, by]) => by === step.fx)?.[0];
        if (undone) fx = fx.filter((f) => f.fx !== undone);
        break;
      }
      default:
        break;
    }
  }
  return { music, fx, at, facing, camera, dark, offers };
}

/** Characters a second the dialogue box writes at (`ui/dialogue.ts`), and a beat to read after. */
const READ_CPS = 38;
const READ_AFTER_MS = 1400;

function lineMs(line: Line, text: (key: string) => string): number {
  const own = (text(line.text).length / READ_CPS) * 1000 + READ_AFTER_MS;
  const reply = line.choice?.[0]?.reply ?? [];
  return own + (line.choice ? 1500 : 0) + reply.reduce((s, l) => s + lineMs(l, text), 0);
}

/**
 * About how long a scene with no `play` takes to watch: its waits, moves and camera moves, and
 * the time to read each line. The server ends a shared scene by it when not every viewer says
 * they are done.
 */
export function sceneLength(scene: Cutscene, text: (key: string) => string): number {
  let ms = 0;
  for (const step of scene.steps) {
    switch (step.do) {
      case "say":
      case "bubble":
        ms += lineMs(step.line, text);
        break;
      case "wait":
        ms += step.ms;
        break;
      case "camera":
        ms += step.ms;
        break;
      case "move":
        ms += step.ms ?? 600;
        break;
      case "show":
        ms += 4000 + step.doc.rows.length * 1200;
        break;
      case "title":
        ms += 5000;
        break;
      case "fx":
        ms += step.fx === "fade-out" || step.fx === "fade-in" ? 600 : 300;
        break;
      default:
        break;
    }
  }
  return ms;
}
