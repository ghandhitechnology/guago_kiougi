/**
 * Presents one showing of a scene (PLAN §4, §15): the content's steps in order, on the stage of
 * the map the player is on. It adds no story: every word comes from the narrative, every mark
 * from the map. The server meets the `play` steps (`cue`) and is told when the scene is done; a
 * scene resumed after a reload is fast-forwarded to where it stood, as `settle` says.
 *
 * Steps run one after another, except walks: an actor walks while the next steps run, and a
 * line from them, a `play`, a fade-out, the title or the end waits until they arrive.
 */
import { audio } from "@guago/audio";
import {
  actorOf,
  type BuiltMap,
  narrative,
  OPENING_SCENES,
  resumeIndex,
  sceneById,
  settle,
  stagingOf,
} from "@guago/content";
import type { SceneStart } from "@guago/shared";
import * as Phaser from "phaser";
import type { DialogueLine } from "../ui/dialogue.ts";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { worldUi } from "../ui/world-ui.ts";
import { dirToward } from "./actors.ts";
import { clearSwarm, pickUp, playFx } from "./fx.ts";
import { showDoc, showTitle, WorldPrompt } from "./page.ts";
import type { Stage } from "./stage.ts";

type Cutscene = narrative.Cutscene;
type Step = narrative.Step;
type Line = narrative.Line;

const KO = narrative.NARRATIVE.ko;
const text = (key: string) => KO[key] ?? "";
const fill = (s: string, player: string) => s.replaceAll("{player}", player);

/** Feet this close to an offered talk's spot can take it. */
const OFFER_PX = 28;
/** The longest a closed dialogue box is waited on to fold away. */
const DIALOGUE_FOLD_MAX_MS = 800;
/** Depth of prompts over the world, above names. */
const PROMPT_DEPTH = 10;

export type Outcome = "done" | "ended";

export class SceneRunner {
  readonly run: number;
  readonly scene: Cutscene;
  readonly shared: boolean;
  readonly skip: boolean;
  private readonly stage: Stage;
  private readonly playerName: string;
  private met: number;
  /** `play` conditions the server met that the presentation has not reached yet. */
  private readonly cues: string[] = [];
  private waiting: { until: string; resolve: () => void } | undefined;
  private readonly walks = new Map<string, Promise<void>>();
  private offers: Extract<Step, { do: "offer" }>[] = [];
  private prompt: WorldPrompt | undefined;
  private promptAt: { x: number; y: number } | undefined;
  private stopped = false;
  private ending: (() => void) | undefined;
  /** The scene holds the player's keys (between `play`s). */
  holding = false;
  /** A talk is open from an offer or the dialogue: the keys stay held. */
  talking = false;
  /**
   * While the scene holds the keys no menu opens: Escape cuts a scene short where it may be
   * (`onSkip`), and Enter is nobody's.
   */
  private readonly keys = new FocusScope();
  onSkip: (() => void) | undefined;

  constructor(stage: Stage, start: SceneStart, playerName: string) {
    const scene = sceneById(start.scene);
    if (!scene) throw new Error(`no scene ${start.scene}`);
    this.run = start.run;
    this.scene = scene;
    this.shared = start.shared;
    this.skip = start.skip;
    this.stage = stage;
    this.met = start.from;
    this.playerName = playerName;
    this.keys.onBack = () => {
      if (this.skip) this.onSkip?.();
    };
  }

  /**
   * Holds the keys or gives them back, with the bars: they slide in as the scene takes over and
   * out as the player gets their body back.
   */
  private hold(on: boolean): void {
    if (this.holding === on) return;
    this.holding = on;
    if (on) pushScope(this.keys);
    else popScope(this.keys);
    this.host.view.letterbox(on, on ? 500 : 380);
  }

  private get host() {
    return this.stage.host;
  }

  private get map(): BuiltMap {
    return this.host.map;
  }

  /** A mark of the map, an actor on stage, or the player, as a point. */
  at = (mark: string | undefined): { x: number; y: number } | undefined => {
    if (!mark) return undefined;
    if (mark === "player") {
      const b = this.host.playerBody();
      return b && { x: b.x, y: b.y };
    }
    const actor = this.stage.actors.get(mark);
    if (actor) return { x: actor.x, y: actor.y };
    return this.map.marks[mark];
  };

  /** Plays the scene to its end, or until the server ends it. */
  async play(): Promise<Outcome> {
    const ended = new Promise<Outcome>((r) => {
      this.ending = () => r("ended");
    });
    const result = await Promise.race([this.perform().then(() => "done" as const), ended]);
    this.cleanup();
    return result;
  }

  /** The server met a `play` step. */
  cue(until: string): void {
    if (this.waiting?.until === until) {
      const w = this.waiting;
      this.waiting = undefined;
      w.resolve();
      return;
    }
    this.cues.push(until);
    // A landing cleared or the first drop picked up shows at once.
    if (until.startsWith("clear:")) clearSwarm(this.stage, landingOf(until));
    if (until.startsWith("pickup:")) pickUp(this.stage);
  }

  /** The condition the scene waits on now, if it waits. */
  get waitingOn(): string | undefined {
    return this.waiting?.until;
  }

  /** The server ended the showing (a shared scene ran its length, the player left). */
  end(): void {
    this.stopped = true;
    this.ending?.();
  }

  /** The interact key: an offered talk in reach is the scene's. True when it took the press. */
  interact(): boolean {
    if (this.talking) return true;
    const offer = this.offerInReach();
    if (!offer) return false;
    this.talking = true;
    void this.say(offer.lines).then(() => {
      this.talking = false;
    });
    return true;
  }

  /** Every frame: actors' plates follow them, and the talk prompt follows what is in reach. */
  update(): void {
    this.stage.update();
    if (this.prompt && this.promptAt) this.prompt.moveTo(this.promptAt.x, this.promptAt.y);
    const offer = this.holding ? undefined : this.offerInReach();
    const near = offer && this.at(this.offerSpeakerAt(offer));
    worldUi.prompt(near ? { x: near.x, y: near.y - 30, kind: "talk" } : undefined);
  }

  private offerInReach(): Extract<Step, { do: "offer" }> | undefined {
    const me = this.host.playerBody();
    if (!me) return undefined;
    return this.offers.find((o) => {
      const p = this.at(this.offerSpeakerAt(o)) ?? this.at(o.at);
      return p && Math.hypot(p.x - me.x, p.y - me.y) <= OFFER_PX;
    });
  }

  /** Who stands at an offer: its first speaker, if they are on stage, else the spot. */
  private offerSpeakerAt(o: Extract<Step, { do: "offer" }>): string {
    const speaker = o.lines[0]?.speaker;
    return speaker && this.stage.actors.has(actorOf(speaker)) ? actorOf(speaker) : o.at;
  }

  // Setting the stage ----------------------------------------------------------------------

  /** What earlier beats of the opening left on this map: they share one stage. */
  private before(): Cutscene[] {
    const i = OPENING_SCENES.indexOf(this.scene.id);
    if (i <= 0) return [];
    const out: Cutscene[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const s = sceneById(OPENING_SCENES[j] as string);
      if (!s || s.map !== this.scene.map) break;
      out.unshift(s);
    }
    return out;
  }

  private async setStage(from: number): Promise<void> {
    const staging = stagingOf(this.scene.id);
    const earlier = this.before().map((s) => settle(s, s.steps.length));
    const now = settle(this.scene, from);
    // Music: the last asked for, here or in an earlier beat on this map.
    const music = [now, ...earlier.slice().reverse()].find((s) => s.music !== undefined)?.music;
    if (music !== undefined) this.music(music);
    // Who is on stage, and where: earlier beats' marks, this scene's own, else their spot.
    const cast = new Set(this.scene.cast.filter((c) => c !== "player"));
    this.stage.dismiss(new Set([...cast, "odap-golem"]));
    const me = this.host.playerBody();
    let beside = 0;
    for (const id of cast) {
      const mark =
        now.at[id] ?? earlier.reduce<string | undefined>((m, s) => s.at[id] ?? m, undefined);
      const spot = this.map.npcs.find((n) => n.speaker === id);
      const enter = staging.enter[id];
      let p = mark ? this.map.marks[mark] : undefined;
      if (!p && spot) p = { x: spot.x, y: spot.y };
      if (!p && enter === "@player" && me) {
        beside++;
        p = { x: me.x + (beside % 2 ? 18 : -18) * Math.ceil(beside / 2), y: me.y + 4 };
      }
      if (!p && enter) p = this.map.marks[enter];
      if (!p) continue;
      const dir = now.facing[id] ?? spot?.facing ?? "down";
      const actor = this.stage.actor(this.scene.id, id, p.x, p.y, dir);
      actor?.place(p.x, p.y);
    }
    // Lasting effects, in the order they were played.
    for (const s of [...earlier, now]) {
      for (const f of s.fx) await playFx(this.fxContext(), f.fx, f.at, true);
    }
    if (now.facing.player) this.host.facePlayer(now.facing.player);
    if (now.camera) {
      const p = this.at(now.camera);
      if (p) {
        this.host.takeCamera(true);
        await this.host.panTo(p.x, p.y, 0);
      }
    }
    if (now.dark) await this.host.curtain.close(0);
    this.offers = [...now.offers];
  }

  private fxContext() {
    return { stage: this.stage, at: this.at };
  }

  // Running --------------------------------------------------------------------------------

  private async perform(): Promise<void> {
    this.hold(true);
    const start = resumeIndex(this.scene, this.met);
    audio.preload("page1");
    await this.setStage(start);
    const steps = this.scene.steps;
    let i = start;
    while (i < steps.length && !this.stopped) {
      const step = steps[i] as Step;
      // Lines said one after another share one dialogue box.
      if (step.do === "say") {
        const lines: Line[] = [];
        while (i < steps.length) {
          const s = steps[i] as Step;
          if (s.do !== "say") break;
          lines.push(s.line);
          i++;
          if (s.line.choice) break;
        }
        await this.waitWalks(lines.map((l) => actorOf(l.speaker)));
        await this.say(lines);
        continue;
      }
      await this.step(step, i);
      i++;
    }
    await this.waitWalks();
  }

  private async step(step: Step, index: number): Promise<void> {
    const { view } = this.host;
    switch (step.do) {
      case "bubble": {
        const id = actorOf(step.line.speaker);
        await this.waitWalks([id]);
        await this.frame(id);
        if (this.stage.actors.has(id))
          worldUi.bark(this.stage.key(id), fill(text(step.line.text), this.playerName));
        return this.sleep(1100 + Math.min(1600, text(step.line.text).length * 45));
      }
      case "camera": {
        const p = this.at(step.to);
        if (!p) return;
        this.host.takeCamera(true);
        await this.host.panTo(p.x, p.y, step.ms);
        return;
      }
      case "move": {
        const ms = step.ms ?? 900;
        if (step.actor === "player") {
          this.host.followServer(true);
          this.host.send({ t: "walk", run: this.run, to: step.to, ms });
          this.walks.set("player", this.sleep(ms + 120));
          return;
        }
        const actor = this.stage.actors.get(step.actor);
        const p = this.map.marks[step.to];
        if (!actor || !p) return;
        this.walks.set(step.actor, actor.walkTo(p.x, p.y, ms));
        return;
      }
      case "face": {
        if (step.actor === "player") this.host.facePlayer(step.dir);
        else this.stage.actors.get(step.actor)?.face(step.dir);
        return;
      }
      case "anim": {
        await this.waitWalks([step.actor]);
        const posed =
          step.actor === "player"
            ? this.host.posePlayer(step.anim)
            : (this.stage.actors.get(step.actor)?.pose(step.anim) ?? false);
        return posed ? this.sleep(900) : undefined;
      }
      case "fx": {
        if (step.fx === "fade-out") await this.waitWalks();
        // A fade-in at a mark is a cut: the player stands there when it lifts.
        if (step.fx === "fade-in" && step.at) {
          this.host.send({ t: "walk", run: this.run, to: step.at, ms: 0 });
          const p = this.at(step.at);
          if (p) {
            this.host.takeCamera(true);
            await this.host.panTo(p.x, p.y, 0);
          }
          await this.sleep(250);
        }
        await playFx(this.fxContext(), step.fx, step.at);
        return;
      }
      case "sound":
        audio.cue(step.cue);
        return;
      case "music":
        this.music(step.track);
        return;
      case "wait":
        return this.sleep(step.ms);
      case "show":
        await showDoc(this.host.ui, step.doc, (k) => fill(text(k), this.playerName));
        return;
      case "system":
        // The line and what it books come from the server, now.
        this.host.send({ t: "reach", run: this.run, step: index });
        return this.sleep(1400);
      case "play":
        await this.playStep(step);
        return;
      case "offer":
        this.offers.push(step);
        return;
      case "title":
        await this.waitWalks();
        // Deeper bars for the card; they go with the scene.
        view.letterbox(true, 700, 34);
        await showTitle(this.host.ui, step.lines.map(text));
        return;
      default:
        return;
    }
  }

  /** Control back to the player until the server says the condition is met. */
  private async playStep(step: Extract<Step, { do: "play" }>): Promise<void> {
    await this.waitWalks();
    const queued = this.cues.indexOf(step.until);
    if (queued >= 0) {
      this.cues.splice(queued, 1);
      this.met++;
      this.offers = [];
      return;
    }
    // A landing's fight waits here: its 오답 stand on it until the fight is over.
    if (step.until.startsWith("clear:")) {
      const landing = landingOf(step.until);
      if (landing && !this.stage.lasting.has(`odap-surge@${landing}`))
        await playFx(this.fxContext(), "odap-surge", landing);
    }
    this.host.takeCamera(false);
    this.host.followServer(false);
    this.host.facePlayer(undefined);
    this.hold(false);
    if (step.prompt) {
      const where = step.at ?? (step.prompt === "move" ? undefined : "player");
      this.promptAt = this.promptPoint(where, step.prompt);
      if (this.promptAt) {
        this.prompt = new WorldPrompt(
          this.host.scene,
          step.prompt,
          this.promptAt.x,
          this.promptAt.y,
          PROMPT_DEPTH,
        );
      }
    }
    await new Promise<void>((resolve) => {
      this.waiting = { until: step.until, resolve };
    });
    this.met++;
    this.prompt?.destroy();
    this.prompt = undefined;
    this.promptAt = undefined;
    this.offers = [];
    this.hold(true);
  }

  private promptPoint(
    where: string | undefined,
    kind: string,
  ): { x: number; y: number } | undefined {
    const p = this.at(where);
    if (!p) return undefined;
    // Over a person's head or a thing; a place to walk to is pointed at from just above.
    const lift =
      where === "player" || this.stage.actors.has(where ?? "") ? 30 : kind === "move" ? 14 : 8;
    return { x: p.x, y: p.y - lift };
  }

  private async say(lines: readonly Line[]): Promise<void> {
    const shown: DialogueLine[] = lines.map((l) => ({
      speaker: l.speaker,
      text: fill(text(l.text), this.playerName),
      ...(l.face ? { face: l.face } : {}),
      ...(l.choice ? { choices: l.choice.map((c) => fill(text(c.text), this.playerName)) } : {}),
    }));
    // A speaker on stage the held camera does not show is looked at before they speak.
    await this.frame(actorOf(lines[0]?.speaker ?? ""));
    // Speakers on stage turn to the player as they talk.
    const me = this.host.playerBody();
    for (const l of lines) {
      const a = this.stage.actors.get(actorOf(l.speaker));
      if (a && me && !this.walks.has(a.id)) a.face(dirToward(a.x, a.y, me.x, me.y, "down"));
    }
    await this.boxFolded();
    const picked = await worldUi.say(shown);
    const last = lines.at(-1);
    const reply = picked === undefined ? undefined : last?.choice?.[picked]?.reply;
    if (reply?.length) await this.say(reply);
  }

  /**
   * Waits while a dialogue box that just closed is still folding away. `ui/dialogue.ts` lays a
   * box down only when it is hidden, and its fold hides it when done even if it was opened again
   * meanwhile: a line said during the fold would wait forever on a box nobody sees.
   */
  private async boxFolded(): Promise<void> {
    const ui = this.host.ui as { dialogue?: { open: boolean; root?: { visible: boolean } } };
    const box = ui.dialogue;
    const t0 = this.host.scene.time.now;
    while (box && !box.open && box.root?.visible) {
      if (this.host.scene.time.now - t0 > DIALOGUE_FOLD_MAX_MS) return;
      await new Promise((r) => this.host.ui.events.once(Phaser.Scenes.Events.POST_UPDATE, r));
    }
  }

  /** Takes the camera to an actor on stage who is out of its view, before they speak. */
  private async frame(id: string): Promise<void> {
    const a = this.stage.actors.get(id);
    if (!a) return;
    const view = this.host.scene.cameras.main.worldView;
    const margin = 24;
    const inside =
      a.x > view.x + margin &&
      a.x < view.right - margin &&
      a.y > view.y + margin &&
      a.y < view.bottom - margin;
    if (inside) return;
    this.host.takeCamera(true);
    await this.host.panTo(a.x, a.y - 12, 600);
  }

  private music(track: narrative.Music | null): void {
    this.stage.air({ music: track });
  }

  private async waitWalks(ids?: readonly string[]): Promise<void> {
    const pending = ids
      ? ids.flatMap((id) => {
          const w = this.walks.get(id);
          return w ? [w] : [];
        })
      : [...this.walks.values()];
    if (pending.length === 0) return;
    await Promise.all(pending);
    for (const id of ids ?? [...this.walks.keys()]) this.walks.delete(id);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => this.host.scene.time.delayedCall(ms, () => r()));
  }

  private cleanup(): void {
    this.hold(false);
    this.prompt?.destroy();
    this.prompt = undefined;
    worldUi.prompt(undefined);
    this.host.followServer(false);
    this.host.facePlayer(undefined);
    this.host.takeCamera(false);
  }
}

/** The landing a `clear:` condition names. */
function landingOf(until: string): string | undefined {
  const m = until.slice(6).replace(/-first$/, "");
  return m || undefined;
}
