/**
 * The story on the server (PLAN §4 opening, §10 shared progress, §15 story quests). It decides
 * that a character has reached a scene, which scene plays, when each of its `play` steps is met
 * and when it is over; clients only present (`apps/client/src/story`). It keeps:
 *
 * - The opening: a first login plays it in private copies of its maps, beat by beat. Where a
 *   character stands in it is in the database (`StoryStore`), so a reload resumes at the last
 *   `play` met and a character who finished it never sees it again.
 * - The 집: 명령퇴사 is a private copy too, its scene paced by the minutes served.
 * - Page beats: each player's own version plays at its place once the server reached its
 *   milestone, and counts for the story quest.
 * - Shared scenes: a boss freed plays for everyone in the arena (`playShared`, which the raid
 *   system calls too), and anyone can replay it later from the story log in a private copy.
 */
import {
  type BuiltMap,
  narrative,
  OPENING_SCENES,
  playCondition,
  playSteps,
  resumeIndex,
  sceneById,
  sceneFrom,
  sceneLength,
  settle,
  stageMapOf,
  stagingOf,
  storyPlaces,
} from "@guago/content";
import {
  type Character,
  EXPEL,
  type Facing,
  facingOf,
  INTERACT_REACH_PX,
  type Interaction,
  MINUTE_MS,
  PLAYER_SPEED,
  type SceneCue,
  type SceneEnd,
  type SceneStart,
  SECOND_MS,
  STORY_MESSAGES,
  type StoryRequest,
} from "@guago/shared";
import { background } from "../background.ts";
import type { Db } from "../db/index.ts";
import { describeError } from "../db/index.ts";
import { mapOptionAllowed } from "../enter.ts";
import { live } from "../live/current.ts";
import { allMaps, belongsOn, builtMap, HOME_MAP, spawnPlace } from "../world-maps.ts";
import { OPENING_DONE, StoryStore } from "./progress.ts";

type Cutscene = narrative.Cutscene;

/** Where a body is sent: a map (or a private copy of it) and the spot, written down or not. */
export interface Destination {
  readonly map: string;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  /** A private copy of the map, for the character alone. */
  readonly instance: boolean;
  /** The character's saved place becomes this one (the end of the opening, the 집). */
  readonly write: boolean;
  /** What took them: shown as the door they came through. */
  readonly via: string;
}

/** What the story needs from a map room; `MapRoom` is one. */
export interface StoryRoom {
  readonly roomId: string;
  readonly mapId: string;
  /** The character a private copy was made for. */
  readonly owner: string | undefined;
  readonly mapDef: BuiltMap;
  tell(sessionId: string, type: string, body: unknown): void;
  bodyOf(sessionId: string): { x: number; y: number } | undefined;
  /** The body's control mode walks it (완전 자동, 스킬 수동), not the player's keys. */
  autoWalks(sessionId: string): boolean;
  /** Walks a body to a spot over `ms` (0 puts it there), the room's own way. */
  walkBody(sessionId: string, x: number, y: number, ms: number): void;
  sendOn(sessionId: string, to: Destination): void;
  /** Sends a body back to where its saved record says it belongs (after a replay). */
  sendBack(sessionId: string): void;
}

type Kind = "opening" | "home" | "beat" | "replay" | "shared";

interface Run {
  readonly id: number;
  readonly room: StoryRoom;
  readonly sessionId: string;
  readonly characterId: string;
  readonly scene: Cutscene;
  readonly kind: Kind;
  /** `play` steps met. */
  met: number;
  /** `system` steps whose effect has landed. */
  readonly reached: Set<number>;
  /** Where the body stood, and for how many story ticks, while a `near:` waits. */
  still: { x: number; y: number; n: number } | undefined;
}

interface Showing {
  readonly room: StoryRoom;
  readonly scene: Cutscene;
  readonly runs: Set<number>;
  readonly done: Set<number>;
  readonly ended: Promise<void>;
  end: () => void;
}

/** Feet this close to a mark meet a `near:` step. */
const NEAR_PX = 24;
/** Story ticks (two fight ticks each) a body its mode walks stands idle before it walks on. */
const IDLE_WALK_TICKS = 15;
/** A shared scene ends when every viewer is done, or after its length and this much more. */
const SHARED_SLACK = 1.5;
const SHARED_EXTRA_MS = 8000;

const KO = narrative.NARRATIVE.ko;
const MILESTONE_ORDER: readonly string[] = narrative.MILESTONES;

/** What a `system` step does besides the line it shows, once per showing. */
const SYSTEM_EFFECTS: Readonly<Record<string, (characterId: string) => void>> = {
  "demerit.curfew": (id) => void live()?.events.curfew(id),
};

/** The kind of a usable thing named anywhere on the built maps (`quest-board` is the board). */
const THING_KINDS = new Map(
  allMaps().flatMap((m) => m.interactables.map((t) => [t.id, t.kind] as const)),
);
/** Kinds whose `interact:` step opens their panel as it is met. */
const OPENS_PANEL = new Set(["quests", "board", "codex", "replay", "shop", "station"]);

function stageMap(scene: Cutscene): BuiltMap | undefined {
  return stageMapOf(allMaps(), scene.map);
}

function openingScene(beat: number): Cutscene | undefined {
  const id = OPENING_SCENES[beat];
  return id ? sceneById(id) : undefined;
}

function reached(after: string | undefined): boolean {
  if (!after) return true;
  const now = live()?.page.milestone() ?? "opening";
  return MILESTONE_ORDER.indexOf(now) >= MILESTONE_ORDER.indexOf(after);
}

/** The point of a mark on a map, or undefined. */
function markOf(map: BuiltMap, mark: string | undefined): { x: number; y: number } | undefined {
  return mark ? map.marks[mark] : undefined;
}

class Director {
  private store: StoryStore | undefined;
  private opening = false;
  private nextRun = 1;
  private readonly runs = new Map<number, Run>();
  private readonly bySession = new Map<string, number>();
  private readonly showings = new Map<string, Showing>();
  /** Characters on their way into a private copy to replay a scene. */
  private readonly replays = new Map<string, { map: string; scene: string }>();
  private unlisten: (() => void) | undefined;

  /** Called once at start: the database for story progress, and whether new players open. */
  provide(o: { db?: Db; opening?: boolean }): void {
    this.store = o.db ? new StoryStore(o.db) : undefined;
    this.opening = o.opening ?? false;
    this.unlisten?.();
    this.unlisten = live()?.onFreed((boss) => {
      const script = narrative.NARRATIVE.bosses.find((b) => b.boss === boss);
      if (script) background("freed scene", this.playSharedOn(script.freed));
    });
  }

  // Where a character belongs --------------------------------------------------------------

  /**
   * The map a character belongs on and whether in a private copy: its opening beat while the
   * opening is not over, the 집 while sent home, else where it was saved (`belongsOn`).
   */
  async whereBelongs(
    c: Pick<Character, "id" | "mapId" | "x" | "y">,
  ): Promise<{ map: string; instance: boolean }> {
    if (this.opening && this.store) {
      const p = await this.store.get(c.id);
      const scene = openingScene(p.beat);
      const map = scene && stageMap(scene);
      if (map) return { map: map.id, instance: true };
    }
    if ((await live()?.homeUntil(c.id)) != null) return { map: HOME_MAP, instance: true };
    return { map: belongsOn(c, false), instance: false };
  }

  /** Whether a room may take this character: the join check (`MapRoom.onJoin`). */
  async mayJoin(room: StoryRoom, c: Pick<Character, "id" | "mapId" | "x" | "y">) {
    const where = await this.whereBelongs(c);
    if (!room.owner) return !where.instance && where.map === room.mapId;
    if (room.owner !== c.id) return false;
    if (where.instance && where.map === room.mapId) return true;
    return this.replays.get(c.id)?.map === room.mapId;
  }

  /** Development entries that name their map skip the opening. */
  async skipOpening(characterId: string): Promise<void> {
    const p = await this.store?.get(characterId);
    if (p && p.beat < OPENING_DONE) await this.store?.setOpening(characterId, OPENING_DONE, 0);
  }

  /**
   * Where a character entering a private copy stands: where the scene had the player last
   * walk to, else where the scene starts, else nowhere in particular (the map's spawn).
   */
  async startPlace(
    room: StoryRoom,
    characterId: string,
  ): Promise<{ x: number; y: number } | undefined> {
    const scene = await this.instanceScene(room, characterId);
    if (!scene) return undefined;
    const p = scene.kind === "opening" ? await this.store?.get(characterId) : undefined;
    const settled = settle(scene.scene, resumeIndex(scene.scene, p?.play ?? 0));
    // A replay with no start of its own stands where its first shot looks; the opening and the
    // 집 say where, or the map's arrival does.
    const mark =
      settled.at.player ??
      stagingOf(scene.scene.id).start ??
      (scene.kind === "replay" ? firstMark(scene.scene) : undefined);
    const at = markOf(room.mapDef, mark);
    // A mark on a thing one uses (the cooler, the log book) is stood in front of.
    const thing = room.mapDef.interactables.some((t) => t.id === mark);
    return at && thing ? { x: at.x, y: at.y + 16 } : at;
  }

  private async instanceScene(
    room: StoryRoom,
    characterId: string,
  ): Promise<{ scene: Cutscene; kind: Kind } | undefined> {
    if (room.owner !== characterId) return undefined;
    const replay = this.replays.get(characterId);
    if (replay?.map === room.mapId) {
      const scene = sceneById(replay.scene);
      return scene && { scene, kind: "replay" };
    }
    if (this.opening && this.store) {
      const p = await this.store.get(characterId);
      const scene = openingScene(p.beat);
      if (scene && stageMap(scene)?.id === room.mapId) return { scene, kind: "opening" };
    }
    const home = room.mapId === HOME_MAP ? await live()?.homeUntil(characterId) : null;
    if (home != null) {
      noteHome(characterId, home);
      const scene = sceneById("expel-home");
      return scene && { scene, kind: "home" };
    }
    return undefined;
  }

  // Arriving and leaving -------------------------------------------------------------------

  /** A body was seated: the scene it is owed starts. */
  async arrived(room: StoryRoom, sessionId: string, characterId: string, zones: readonly string[]) {
    try {
      const showing = this.showings.get(room.roomId);
      if (showing) {
        const run = this.start(room, sessionId, characterId, showing.scene, "shared", 0);
        showing.runs.add(run.id);
        return;
      }
      const owed = await this.instanceScene(room, characterId);
      if (owed) {
        const from =
          owed.kind === "opening"
            ? ((await this.store?.get(characterId))?.play ?? 0)
            : owed.kind === "home"
              ? this.homeMinutes(characterId)
              : 0;
        this.start(room, sessionId, characterId, owed.scene, owed.kind, from);
        return;
      }
      await this.beatsAt(room, sessionId, characterId, zones);
    } catch (error) {
      console.error(`story arrival failed: ${describeError(error)}`);
    }
  }

  /** Walked into a room zone: a beat staged there may start. */
  zonesChanged(room: StoryRoom, sessionId: string, characterId: string, zones: readonly string[]) {
    if (room.owner || this.bySession.has(sessionId)) return;
    background("story beats", this.beatsAt(room, sessionId, characterId, zones));
  }

  /**
   * The body left the room: its scene ends with it, and plays again from its last `play`. A
   * character that left the game (`gone`) is no longer held in memory.
   */
  left(sessionId: string, gone?: string): void {
    if (gone) this.store?.forget(gone);
    const id = this.bySession.get(sessionId);
    if (id === undefined) return;
    this.bySession.delete(sessionId);
    const run = this.runs.get(id);
    this.runs.delete(id);
    if (!run) return;
    const showing = this.showings.get(run.room.roomId);
    if (showing?.runs.delete(id)) this.settleShowing(showing);
    if (run.kind === "replay") this.replays.delete(run.characterId);
  }

  /** A scene is being shown to this session (the 집 waits for it before letting go). */
  busy(sessionId: string): boolean {
    return this.bySession.has(sessionId);
  }

  private async beatsAt(
    room: StoryRoom,
    sessionId: string,
    characterId: string,
    zones: readonly string[],
  ): Promise<void> {
    if (!this.store || this.bySession.has(sessionId)) return;
    const here = new Set([...storyPlaces(room.mapId), ...zones.flatMap(storyPlaces)]);
    const p = await this.store.get(characterId);
    for (const beat of narrative.NARRATIVE.story) {
      if (!beat.lines?.length || p.seen.has(beat.id) || !reached(beat.after)) continue;
      const staged = stageMapOf(allMaps(), beat.map);
      if (!here.has(beat.map) && !(staged?.id === room.mapId && staged.id !== beat.map)) continue;
      const scene = sceneById(beat.id);
      if (!scene || this.bySession.has(sessionId)) return;
      this.start(room, sessionId, characterId, scene, "beat", 0);
      return;
    }
  }

  private start(
    room: StoryRoom,
    sessionId: string,
    characterId: string,
    scene: Cutscene,
    kind: Kind,
    from: number,
  ): Run {
    const previous = this.bySession.get(sessionId);
    if (previous !== undefined) this.end(previous);
    const run: Run = {
      id: this.nextRun++,
      room,
      sessionId,
      characterId,
      scene,
      kind,
      met: Math.min(from, playSteps(scene).length),
      reached: new Set(),
      still: undefined,
    };
    this.runs.set(run.id, run);
    this.bySession.set(sessionId, run.id);
    const staging = stagingOf(scene.id);
    room.tell(sessionId, STORY_MESSAGES.scene, {
      run: run.id,
      scene: scene.id,
      from: run.met,
      shared: kind === "shared",
      skip: staging.skip,
    } satisfies SceneStart);
    return run;
  }

  /** Ends a showing for its session, telling the client. */
  private end(id: number): void {
    const run = this.runs.get(id);
    if (!run) return;
    this.runs.delete(id);
    if (this.bySession.get(run.sessionId) === id) this.bySession.delete(run.sessionId);
    run.room.tell(run.sessionId, STORY_MESSAGES.end, { run: id } satisfies SceneEnd);
  }

  // Meeting `play` steps -------------------------------------------------------------------

  private runOf(sessionId: string): Run | undefined {
    const id = this.bySession.get(sessionId);
    return id === undefined ? undefined : this.runs.get(id);
  }

  private next(run: Run): string | undefined {
    return playCondition(run.scene, run.met)?.until;
  }

  private meet(run: Run, until: string): void {
    if (this.next(run) !== until) return;
    run.met++;
    run.room.tell(run.sessionId, STORY_MESSAGES.cue, { run: run.id, until } satisfies SceneCue);
    if (run.kind === "opening") {
      const p = this.store;
      background(
        "story progress",
        p?.get(run.characterId).then((s) => p.setOpening(run.characterId, s.beat, run.met)),
      );
    }
  }

  /** Once a tick or so: bodies that reached the mark their scene waits at, minutes served. */
  tick(room: StoryRoom): void {
    for (const run of this.runs.values()) {
      if (run.room !== room) continue;
      const until = this.next(run);
      if (!until) continue;
      if (until.startsWith("near:")) {
        const at = markOf(room.mapDef, until.slice(5));
        const body = room.bodyOf(run.sessionId);
        if (!at || !body) continue;
        if (Math.hypot(body.x - at.x, body.y - at.y) <= NEAR_PX) {
          run.still = undefined;
          this.meet(run, until);
        } else if (room.autoWalks(run.sessionId)) this.walkIdle(run, body, at);
      } else if (until.startsWith("home-minute:")) {
        if (this.homeMinutes(run.characterId) >= Number(until.slice(12))) this.meet(run, until);
      }
    }
  }

  /**
   * A body its mode walks has nothing to walk to once a fight is over: when it has stood still a
   * moment while the scene waits for it at a mark, it walks there.
   */
  private walkIdle(run: Run, body: { x: number; y: number }, at: { x: number; y: number }) {
    const s = run.still;
    if (!s || Math.hypot(s.x - body.x, s.y - body.y) > 1) {
      run.still = { x: body.x, y: body.y, n: 0 };
      return;
    }
    if (++s.n !== IDLE_WALK_TICKS) return;
    const ms = (Math.hypot(at.x - body.x, at.y - body.y) / PLAYER_SPEED) * SECOND_MS;
    run.room.walkBody(run.sessionId, at.x, at.y, ms);
  }

  /** Whole minutes of 명령퇴사 served (the home scene's `home-minute:<n>`). */
  private homeMinutes(characterId: string): number {
    const l = live();
    const until = l ? homeUntilCached.get(characterId) : undefined;
    if (!l || until === undefined) return 0;
    const start = until - EXPEL.homeSeconds * SECOND_MS;
    return Math.max(0, Math.floor((l.clock.now() - start) / MINUTE_MS));
  }

  /**
   * The player used something. When their scene waits on using it (`interact:<id>`, met by that
   * thing or anything in reach of the step's mark), the scene answers instead of the thing.
   */
  interacted(
    room: StoryRoom,
    sessionId: string,
    thing: string | undefined,
    n: number,
  ): Interaction | undefined {
    const run = this.runOf(sessionId);
    const until = run && this.next(run);
    if (!run || !until?.startsWith("interact:")) return undefined;
    const id = until.slice(9);
    const step = playCondition(run.scene, run.met);
    const at = markOf(room.mapDef, step?.at);
    const body = room.bodyOf(sessionId);
    const near = at && body && Math.hypot(body.x - at.x, body.y - at.y) <= INTERACT_REACH_PX + 16;
    if (thing !== id && !near) return undefined;
    this.meet(run, until);
    const kind = THING_KINDS.get(id);
    return kind && OPENS_PANEL.has(kind) ? { t: "open", n, id, kind } : { t: "none", n };
  }

  /** The player changed control mode (`mode-cycled`). */
  modeChanged(sessionId: string): void {
    const run = this.runOf(sessionId);
    if (run && this.next(run) === "mode-cycled") this.meet(run, "mode-cycled");
  }

  /**
   * A hook other systems meet for the character's scene: a fight's (`clear:landing-3f`,
   * `defeat:odap-golem`, `golem-telegraph`, `dodged:odap-golem`, `pickup:first-drop`), as the
   * opening names them. Ignored unless the scene waits on exactly that next.
   */
  signal(characterId: string, until: string): void {
    for (const run of this.runs.values()) {
      if (run.characterId === characterId && this.next(run) === until) this.meet(run, until);
    }
  }

  /** What the scene the player is in waits on next, for the fights that meet it. */
  waitingOn(characterId: string): string | undefined {
    for (const run of this.runs.values()) {
      if (run.characterId === characterId) return this.next(run);
    }
    return undefined;
  }

  // What the client says --------------------------------------------------------------------

  request(room: StoryRoom, sessionId: string, characterId: string, req: StoryRequest): void {
    if (req.t === "signal") {
      if (mapOptionAllowed()) this.signal(characterId, req.until);
      return;
    }
    if (req.t === "replay") {
      background("story replay", this.replay(room, sessionId, characterId, req.scene));
      return;
    }
    const run = this.runs.get(req.run);
    if (!run || run.sessionId !== sessionId) return;
    if (req.t === "walk") {
      this.walk(run, req.to, req.ms);
      return;
    }
    if (req.t === "reach") {
      const step = run.scene.steps[req.step];
      if (step?.do !== "system" || run.reached.has(req.step)) return;
      run.reached.add(req.step);
      SYSTEM_EFFECTS[step.message]?.(characterId);
      return;
    }
    // Done: every `play` met, or skipped where the scene may be.
    if (run.met < playSteps(run.scene).length) return;
    background("story finish", this.finish(run));
  }

  /** The scene walks the player to one of its marks: only marks it walks the player to. */
  private walk(run: Run, to: string, ms: number): void {
    const allowed = run.scene.steps.some(
      (s) =>
        (s.do === "move" && s.actor === "player" && s.to === to) ||
        (s.do === "fx" && s.fx === "fade-in" && s.at === to),
    );
    const at = markOf(run.room.mapDef, to);
    if (!allowed || !at) return;
    // Everyone a shared scene walks to one mark stands around it, not on one spot.
    let x = at.x;
    let y = at.y;
    const showing = this.showings.get(run.room.roomId);
    if (run.kind === "shared" && showing) {
      const i = [...showing.runs].indexOf(run.id);
      if (i > 0) {
        const a = i * 2.4;
        x += Math.round(Math.cos(a) * (10 + i * 2));
        y += Math.round(Math.sin(a) * (6 + i));
      }
    }
    // A fade-in's cut stands the player just in front of the spot.
    const fade = run.scene.steps.some((s) => s.do === "fx" && s.fx === "fade-in" && s.at === to);
    if (fade) y += 24;
    run.room.walkBody(run.sessionId, x, y, ms);
  }

  private async finish(run: Run): Promise<void> {
    if (this.runs.get(run.id) !== run) return;
    this.runs.delete(run.id);
    if (this.bySession.get(run.sessionId) === run.id) this.bySession.delete(run.sessionId);
    const { room, sessionId, characterId } = run;
    switch (run.kind) {
      case "opening":
        return this.nextBeat(room, sessionId, characterId);
      case "beat":
        if (await this.store?.markSeen(characterId, run.scene.id)) {
          live()?.events.story(characterId, run.scene.id);
        }
        // Another beat may wait in the same place.
        return this.beatsAt(room, sessionId, characterId, []);
      case "replay":
        await this.store?.markSeen(characterId, run.scene.id);
        room.sendBack(sessionId);
        return;
      case "shared": {
        await this.store?.markSeen(characterId, run.scene.id);
        const showing = this.showings.get(room.roomId);
        if (showing) {
          showing.done.add(run.id);
          this.settleShowing(showing);
        }
        return;
      }
      case "home":
        return;
    }
  }

  /** The opening's next beat: here, in a private copy of its map, or the live world after. */
  private async nextBeat(room: StoryRoom, sessionId: string, characterId: string) {
    const store = this.store;
    if (!store) return;
    const p = await store.get(characterId);
    const beat = p.beat + 1;
    await store.setOpening(characterId, beat, 0);
    const scene = openingScene(beat);
    const map = scene && stageMap(scene);
    if (!scene || !map) {
      // The title card is over: the game begins on the 운동장 the opening ended on.
      const field = builtMap("campus-field");
      if (!field) return;
      const at = spawnPlace(field, "main");
      room.sendOn(sessionId, { ...at, map: field.id, instance: false, write: true, via: "story" });
      return;
    }
    if (map.id === room.mapId) {
      this.start(room, sessionId, characterId, scene, "opening", 0);
      return;
    }
    const start = markOf(map, stagingOf(scene.id).start) ?? spawnPlace(map, "main");
    room.sendOn(sessionId, {
      map: map.id,
      x: start.x,
      y: start.y,
      facing: facingOf("down"),
      instance: true,
      write: false,
      via: "story",
    });
  }

  /** 복습: a scene from the story log, again, in a private copy of its map. */
  private async replay(room: StoryRoom, sessionId: string, characterId: string, id: string) {
    const scene = sceneById(id);
    if (!scene || room.owner || this.bySession.has(sessionId)) return;
    if (OPENING_SCENES.includes(id) || id === "expel-home") return;
    if (!reached(sceneFrom(id))) return;
    const map = stageMap(scene);
    if (!map) return;
    this.replays.set(characterId, { map: map.id, scene: id });
    const staging = stagingOf(id);
    const start = markOf(map, staging.start ?? firstMark(scene)) ?? spawnPlace(map, "main");
    room.sendOn(sessionId, {
      map: map.id,
      x: start.x,
      y: start.y,
      facing: facingOf("down"),
      instance: true,
      // Written where they stand now, so coming back lands there.
      write: false,
      via: "replay",
    });
  }

  // Shared scenes ---------------------------------------------------------------------------

  /**
   * Plays a scene for everyone in a room, and anyone who comes in while it runs; resolves when
   * every viewer is done or its length (and some) has passed. The raid system calls this; a boss
   * freed on the live Page calls it for every channel of the boss's arena.
   */
  playShared(
    room: StoryRoom,
    sceneId: string,
    present: readonly [string, string][],
  ): Promise<void> {
    const running = this.showings.get(room.roomId);
    if (running) return running.ended;
    const scene = sceneById(sceneId);
    if (!scene) return Promise.resolve();
    let end = () => {};
    const ended = new Promise<void>((r) => {
      end = r;
    });
    const showing: Showing = { room, scene, runs: new Set(), done: new Set(), ended, end };
    this.showings.set(room.roomId, showing);
    for (const [sessionId, characterId] of present) {
      showing.runs.add(this.start(room, sessionId, characterId, scene, "shared", 0).id);
    }
    const ms = sceneLength(scene, (k) => KO[k] ?? "") * SHARED_SLACK + SHARED_EXTRA_MS;
    const timer = setTimeout(() => this.closeShowing(showing), ms);
    void ended.then(() => clearTimeout(timer));
    if (showing.runs.size === 0) this.closeShowing(showing);
    return ended;
  }

  /** Every channel of a scene's map plays it (a boss freed). */
  private async playSharedOn(sceneId: string): Promise<void> {
    const scene = sceneById(sceneId);
    const map = scene && stageMap(scene);
    if (!map) return;
    await Promise.all(sharedRooms(map.id).map((r) => r.playShared(sceneId)));
  }

  isShowing(roomId: string): boolean {
    return this.showings.has(roomId);
  }

  private settleShowing(showing: Showing): void {
    if ([...showing.runs].every((id) => showing.done.has(id))) this.closeShowing(showing);
  }

  private closeShowing(showing: Showing): void {
    if (this.showings.get(showing.room.roomId) !== showing) return;
    this.showings.delete(showing.room.roomId);
    for (const id of showing.runs) if (!showing.done.has(id)) this.end(id);
    showing.end();
  }
}

/** The first mark a scene's steps name, where a replay stands the player. */
function firstMark(scene: Cutscene): string | undefined {
  for (const s of scene.steps) {
    if (s.do === "camera") return s.to;
    if (s.do === "move" && s.actor === "player") return s.to;
  }
  return scene.marks[0];
}

/**
 * Send-home times as the living world last said them, for the 집's minute count: `homeUntil` is
 * async, and the count is read every tick. Kept by `noteHome`.
 */
const homeUntilCached = new Map<string, number>();

export function noteHome(characterId: string, until: number | null): void {
  if (until === null) homeUntilCached.delete(characterId);
  else homeUntilCached.set(characterId, until);
}

/** Rooms that can play a shared scene, by map: filled in by the map rooms themselves. */
const sharedRoomsByMap = new Map<string, Set<{ playShared(scene: string): Promise<void> }>>();

export function sharedRooms(map: string): { playShared(scene: string): Promise<void> }[] {
  return [...(sharedRoomsByMap.get(map) ?? [])];
}

export function registerSharedRoom(
  map: string,
  room: { playShared(scene: string): Promise<void> },
): () => void {
  let set = sharedRoomsByMap.get(map);
  if (!set) {
    set = new Set();
    sharedRoomsByMap.set(map, set);
  }
  set.add(room);
  return () => set.delete(room);
}

/** The process's story. */
export const story = new Director();
