/**
 * What scenes draw on one map visit: their actors, the people who fill a room around them, and
 * the effects that stay (the lights out, the rift's column through the window). Scenes that
 * follow each other on one map share it, so nothing pops between beats; it goes with the map.
 */
import type { ArtMetadata } from "@guago/art";
import { actorArt, type BuiltMap, narrative } from "@guago/content";
import type { StoryRequest } from "@guago/shared";
import type * as Phaser from "phaser";
import type { Curtain } from "../fade.ts";
import type { MapView } from "../render/index.ts";
import { overrideSoundscape, type Soundscape, soundscapeFor } from "../sound/audio.ts";
import { worldUi } from "../ui/world-ui.ts";
import { type Dir, StoryActor } from "./actors.ts";

/** What a scene needs from the game scene it plays in. */
export interface StageHost {
  readonly scene: Phaser.Scene;
  /** The UI scene, for pages and the title card drawn over everything. */
  readonly ui: Phaser.Scene;
  readonly meta: ArtMetadata;
  readonly map: BuiltMap;
  readonly view: MapView;
  readonly curtain: Curtain;
  /** The player's own drawn body. */
  playerBody(): Phaser.GameObjects.Sprite | undefined;
  /** Plays an animation on the player's body; false when the rig has none of that name. */
  posePlayer(anim: string): boolean;
  /** Turns the player's drawn body, or gives the facing back to the keys with undefined. */
  facePlayer(dir: Dir | undefined): void;
  /** The scene holds the camera (true) or gives it back to the player. */
  takeCamera(on: boolean): void;
  /** Moves the held camera's centre to (x, y), kept inside the map, over `ms` (0 cuts). */
  panTo(x: number, y: number, ms: number): Promise<void>;
  /** Draws the player's body where the server has it (a scene walking it), not under the keys. */
  followServer(on: boolean): void;
  /** Hides the live cast member of a speaker while the scene draws its own. */
  hideNpc(speaker: string, hidden: boolean): void;
  send(req: StoryRequest): void;
}

const SPEAKERS = new Map(narrative.NARRATIVE.speakers.map((s) => [s.id, s]));
const KO = narrative.NARRATIVE.ko;

/** A lasting effect's objects and how to take them down. */
export interface Lasting {
  readonly destroy: () => void;
}

export class Stage {
  readonly host: StageHost;
  readonly actors = new Map<string, StoryActor>();
  /** Lasting effects by `fx@mark`. */
  readonly lasting = new Map<string, Lasting>();
  /** People who fill the room, by scene id that asked for them. */
  readonly extras = new Map<string, Phaser.GameObjects.Sprite[]>();
  private readonly hidden = new Set<string>();
  /** The scenes' music and air over the place's own, once a scene set either. */
  private sound: Soundscape | undefined;

  constructor(host: StageHost) {
    this.host = host;
  }

  /** Sets the scene's music or air; what is not given stays as the scene or the place had it. */
  air(s: Partial<Soundscape>, fade?: number): void {
    const place = soundscapeFor(this.host.map.id, this.host.map.time);
    this.sound = { ...(this.sound ?? place), ...s };
    overrideSoundscape(this.sound, fade);
  }

  /** The actor for `id` in scene `sceneId`, made at (x, y) facing `dir` when not on stage yet. */
  actor(sceneId: string, id: string, x: number, y: number, dir: Dir): StoryActor | undefined {
    let a = this.actors.get(id);
    if (a) return a;
    const { scene, meta, view } = this.host;
    a = StoryActor.make(scene, meta, id, actorArt(sceneId, id));
    if (!a) return undefined;
    a.place(x, y);
    a.face(dir);
    view.addEntity(a.body);
    this.actors.set(id, a);
    // A speaker on stage wears a nameplate and can say a line over their head.
    const name = SPEAKERS.get(id)?.name;
    if (name) worldUi.npc(this.key(id), KO[name] ?? "", a.x, a.y);
    this.host.hideNpc(id, true);
    this.hidden.add(id);
    return a;
  }

  /** The overlay id a stage actor's plate and bubbles hang on. */
  key(id: string): string {
    return `story:${id}`;
  }

  /** Keeps plates over actors who move. */
  update(): void {
    for (const [id, a] of this.actors) {
      if (SPEAKERS.has(id)) worldUi.npc(this.key(id), "", a.x, a.y);
    }
  }

  /** Takes off the stage every actor not in `keep`. */
  dismiss(keep: ReadonlySet<string>): void {
    for (const [id, a] of this.actors) {
      if (keep.has(id)) continue;
      this.drop(id, a);
    }
  }

  private drop(id: string, a: StoryActor): void {
    this.host.view.removeEntity(a.body);
    a.destroy();
    this.actors.delete(id);
    worldUi.npcGone(this.key(id));
    if (this.hidden.delete(id)) this.host.hideNpc(id, false);
  }

  /** Everything off: the map is being left. */
  destroy(): void {
    for (const [id, a] of [...this.actors]) this.drop(id, a);
    for (const l of this.lasting.values()) l.destroy();
    this.lasting.clear();
    for (const people of this.extras.values()) {
      for (const p of people) {
        this.host.view.removeEntity(p);
        p.destroy();
      }
    }
    this.extras.clear();
  }
}
