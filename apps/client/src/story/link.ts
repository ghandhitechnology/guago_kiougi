/**
 * The story's side of a map room (PLAN §4, §15): the server's `scene`, `cue` and `sceneEnd`, a
 * runner for the scene on the stage of the map shown, and what the client says back. A scene that
 * arrives before its map is up waits for it; scenes on one map share its stage.
 */
import type { Room } from "@colyseus/sdk";
import { narrative, OPENING_SCENES } from "@guago/content";
import {
  type MapState,
  type SceneCue,
  type SceneEnd,
  type SceneStart,
  STORY_MESSAGES,
  type StoryLog,
  type StoryRequest,
} from "@guago/shared";
import { overrideSoundscape } from "../sound/audio.ts";
import { worldUi } from "../ui/world-ui.ts";
import { onWorld } from "../world-events.ts";
import { fillRoom } from "./extras.ts";
import { SceneRunner } from "./runner.ts";
import { Stage, type StageHost } from "./stage.ts";

/** A closed curtain no door followed is lifted after this long. */
const LIFT_AFTER_MS = 900;

/** A scene in the story log: its id and its title, as the narrative names it. */
export interface LoggedScene {
  readonly id: string;
  readonly title: string;
}

let current: StoryLink | undefined;

/**
 * The personal story log (PLAN §10 복습) for the panel a replay object opens (`open` with kind
 * `replay`): the scenes this character can play again, oldest first.
 */
export function storyLog(): Promise<readonly LoggedScene[]> {
  return current ? current.log() : Promise.resolve([]);
}

/** Plays a scene from the story log again, in a private copy of its map. */
export function replayScene(id: string): void {
  current?.replay(id);
}

const TITLES = new Map(
  narrative.NARRATIVE.story.flatMap((b) => {
    const title = narrative.NARRATIVE.ko[b.title] ?? "";
    return [[b.id, title] as const, ...(b.cutscene ? [[b.cutscene, title] as const] : [])];
  }),
);

export class StoryLink {
  private room: Room<unknown, MapState> | undefined;
  private stage: Stage | undefined;
  /** The room the stage's map was shown for: a scene for a newer room waits for its map. */
  private stageRoom: Room<unknown, MapState> | undefined;
  private runner: SceneRunner | undefined;
  private pending: SceneStart | undefined;
  private readonly playerName: () => string;

  private readonly logWaiters: ((scenes: readonly string[]) => void)[] = [];

  constructor(playerName: () => string) {
    this.playerName = playerName;
    current = this;
    onWorld((e) => {
      if (e.t === "open" && e.kind === "replay") void this.offerLog(e.id);
    });
  }

  /**
   * A replay object used: its description, with the story log's scenes to pick from in the
   * dialogue box. An object the narrative has not described yet offers nothing.
   */
  private async offerLog(id: string): Promise<void> {
    const ko = narrative.NARRATIVE.ko;
    const d = narrative.NARRATIVE.descriptions.find((x) => x.id === id);
    const text = d && ko[d.desc];
    if (!d || !text) return;
    const scenes = (await this.log()).filter((s) => s.title);
    const speaker = ko[d.name] ?? "";
    const picked = await worldUi.say([
      { speaker, text, ...(scenes.length > 0 ? { choices: scenes.map((s) => s.title) } : {}) },
    ]);
    const scene = picked === undefined ? undefined : scenes[picked];
    if (scene) this.replay(scene.id);
  }

  /** Asks the server for the story log; resolves with it, or empty if the room goes first. */
  log(): Promise<readonly LoggedScene[]> {
    if (!this.room) return Promise.resolve([]);
    return new Promise((resolve) => {
      this.logWaiters.push((ids) =>
        resolve(ids.map((id) => ({ id, title: TITLES.get(id) ?? "" }))),
      );
      this.send({ t: "log" });
    });
  }

  /** A room was joined: its story messages come here. Returns the teardown. */
  attach(room: Room<unknown, MapState>): () => void {
    this.room = room;
    // A scene waiting for the last room's map is that room's, and over.
    this.pending = undefined;
    const offs = [
      room.onMessage(STORY_MESSAGES.scene, (m: SceneStart) => {
        if (this.room === room) this.start(m);
      }),
      room.onMessage(STORY_MESSAGES.cue, (m: SceneCue) => {
        if (this.room === room && this.runner?.run === m.run) this.runner.cue(m.until);
      }),
      room.onMessage(STORY_MESSAGES.log, (m: StoryLog) => {
        if (this.room !== room) return;
        for (const w of this.logWaiters.splice(0)) w(m.scenes);
      }),
      room.onMessage(STORY_MESSAGES.end, (m: SceneEnd) => {
        if (this.room !== room) return;
        if (this.pending?.run === m.run) this.pending = undefined;
        if (this.runner?.run === m.run) this.runner.end();
      }),
    ];
    return () => {
      for (const off of offs) off();
      if (this.room === room) {
        this.room = undefined;
        this.pending = undefined;
        for (const w of this.logWaiters.splice(0)) w([]);
        this.runner?.end();
      }
    };
  }

  /** A map is shown: a new stage, and the scene that was waiting for it starts. */
  onMap(host: StageHost): void {
    this.stage?.destroy();
    this.stage = new Stage(host);
    this.stageRoom = this.room;
    const waiting = this.pending;
    this.pending = undefined;
    if (waiting) this.start(waiting);
  }

  /** The map is being left: its stage goes. */
  leaveMap(): void {
    this.runner?.end();
    this.stage?.destroy();
    this.stage = undefined;
  }

  /** The scene holds the player's keys. */
  get holding(): boolean {
    return !!this.runner && (this.runner.holding || this.runner.talking);
  }

  /** The interact key, when the scene has a use for it. */
  interact(): boolean {
    return this.runner?.interact() ?? false;
  }

  /** Cuts a scene short where it may be. */
  skip(): boolean {
    const r = this.runner;
    if (!r?.skip) return false;
    void worldUi.say([]);
    r.end();
    this.send({ t: "done", run: r.run });
    return true;
  }

  /** The scene being shown, for development checks. */
  get sceneId(): string | undefined {
    return this.runner?.scene.id;
  }

  /** What the scene waits on now, for the development signal. */
  get waitingOn(): string | undefined {
    return this.runner?.waitingOn;
  }

  update(): void {
    this.runner?.update();
  }

  /** Asks the server to play a scene from the story log again. */
  replay(scene: string): void {
    this.send({ t: "replay", scene });
  }

  private send(req: StoryRequest): void {
    this.room?.send(STORY_MESSAGES.story, req);
  }

  private start(m: SceneStart): void {
    const stage = this.stage;
    // A scene can come from a room joined before the map it plays on is shown.
    if (!stage || this.stageRoom !== this.room) {
      this.pending = m;
      return;
    }
    this.runner?.end();
    const runner = new SceneRunner(stage, m, this.playerName());
    runner.onSkip = () => this.skip();
    this.runner = runner;
    fillRoom(stage, m.scene);
    void runner.play().then((outcome) => {
      if (this.runner === runner) this.runner = undefined;
      if (outcome === "done") this.send({ t: "done", run: runner.run });
      this.after(runner, stage);
    });
  }

  /**
   * After a scene: the music goes back to the place's own unless the opening goes on, and a
   * curtain a fade-out left closed lifts unless a door follows.
   */
  private after(runner: SceneRunner, stage: Stage): void {
    const i = OPENING_SCENES.indexOf(runner.scene.id);
    const opening = i >= 0 && i < OPENING_SCENES.length - 1;
    if (opening) return;
    overrideSoundscape(null);
    stage.host.scene.time.delayedCall(LIFT_AFTER_MS, () => {
      if (this.stage !== stage || this.runner) return;
      if (stage.host.curtain.closed) void stage.host.curtain.open(700);
    });
  }
}
