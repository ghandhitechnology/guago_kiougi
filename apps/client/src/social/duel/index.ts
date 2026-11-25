import { DUEL_QUEUE_LOCK_SECONDS, MAP_SOURCES } from "@guago/content";
import {
  DUEL_MODES,
  type DuelEvent,
  type DuelMode,
  type DuelPerson,
  type DuelResultView,
  type DuelSides,
  type FloorView,
} from "@guago/shared";
import * as Phaser from "phaser";
import { clock } from "../../copy/lines.ts";
import { t } from "../../i18n/index.ts";
import type { MenuTab } from "../../menu/notebook.ts";
import { cue } from "../../sound/audio.ts";
import { Button } from "../../ui/button.ts";
import { toast } from "../../ui/overlay.ts";
import { Label } from "../../ui/text.ts";
import { paint } from "../../ui/theme.ts";
import type { Ctx } from "../../ui/widget.ts";
import { worldUi } from "../../ui/world-ui.ts";
import { type FightFeed, onWorld } from "../../world-events.ts";
import type { WorldLink } from "../../world-link.ts";
import { ask } from "../act.ts";
import type { Slips } from "../slips.ts";
import { line, term } from "../words.ts";
import { FloorBanner, minutes, type RoundEnd } from "./banner.ts";
import { DuelRecords } from "./records.ts";
import { ResultCard } from "./result.ts";

export { DuelRecords } from "./records.ts";

/** Where the player stands in the 콜로세움's matchmaking, as the server last said. */
export interface DuelState {
  /** In the casual queue since `since`, with these party members. */
  readonly queue: { mode: DuelMode; since: number; with: readonly DuelPerson[] } | null;
  /** A match the queue found, waiting on everyone's answer; `accepted` by character id. */
  readonly found: {
    id: number;
    mode: DuelMode;
    expiresAt: number;
    you: number;
    sides: DuelSides;
    accepted: readonly string[];
  } | null;
  /** A match on, from `match` until `over`. */
  readonly match: { id: number; mode: DuelMode; you: number; sides: DuelSides } | null;
  /** The player's own challenge, waiting on an answer. */
  readonly out: { id: number; to: DuelPerson } | null;
}

/** The queues offered at the rail. */
const RING_SLIP = "duel:ring";

/** `m:ss` since `since`. */
function waited(since: number): string {
  return minutes(Math.floor((Date.now() - since) / 1000));
}

/** A 콜로세움 label from the narrative's terms: modes, sides, columns, buttons. */
export function label(id: string): string {
  return term("label", id);
}

/** A mode as the UI writes it: 1대1, 3대3. */
export function modeName(mode: DuelMode): string {
  return label(`duel-${mode}`);
}

/** Duels played and won as the record reads: `3전 2승`. */
export function recordText(r: { played: number; won: number }): string {
  return `${r.played}${label("duel-played")} ${r.won}${label("duel-won")}`;
}

/** 권 사감's line, as a toast, when the narrative has it. */
function say(id: string, params: Readonly<Record<string, string | number>> = {}): void {
  const text = line(id, params);
  if (text) toast(text);
}

/**
 * Zones that stand round a dueling floor, by map: the floor's own named room and the rails one
 * can watch from (gathering spots and rooms within a few tiles of it). Standing in one offers
 * the queue and shows a match on the floor.
 */
const RING: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const reach = 4;
  const out = new Map<string, Set<string>>();
  for (const m of MAP_SOURCES) {
    for (const a of m.arenas ?? []) {
      if (typeof a.rect === "string" || a.modes.length === 0) continue;
      const r = a.rect;
      for (const z of m.zones ?? []) {
        if ((z.kind !== "gather" && z.kind !== "room") || typeof z.rect === "string") continue;
        const q = z.rect;
        const near =
          q.x < r.x + r.w + reach &&
          q.x + q.w > r.x - reach &&
          q.y < r.y + r.h + reach &&
          q.y + q.h > r.y - reach;
        if (!near) continue;
        const set = out.get(m.id) ?? new Set<string>();
        set.add(z.id);
        out.set(m.id, set);
      }
    }
  }
  return out;
})();

/**
 * The 콜로세움 as a player meets it (PLAN §14), in 권 사감's paperwork: a challenge from the card
 * is a 신청서 on a slip with 받기 and 반려 (회수 on the challenger's), the queue for 1대1 and 3대3
 * is her 명단, offered at the rail round the floor and in the notebook, the ready check is a 점호
 * slip with its fuse, the floor's banner shows for fighters and for whoever watches from the
 * ring, then the result card, and the record the player card shows.
 */
export class Duels {
  readonly records: DuelRecords;
  private readonly scene: Phaser.Scene;
  private readonly link: WorldLink;
  private readonly slips: Slips;
  private readonly banner: FloorBanner;
  private state: DuelState = { queue: null, found: null, match: null, out: null };
  private readonly listeners = new Set<(s: DuelState) => void>();
  /** Challenges on slips: the other player's name, and whether this player sent it. */
  private readonly challenges = new Map<number, { name: string; mine: boolean }>();
  /** The ready check this player refused, for whose line the cancel is. */
  private refused = 0;
  /** A match fell through: the next `queued` puts those who answered back at the front. */
  private requeued = false;
  private result: ResultCard | undefined;
  /** Matches whose result card was shown already. */
  private readonly shown: number[] = [];
  private map = "";
  private zones: readonly string[] = [];
  private floor: FloorView | undefined;
  private feed: FightFeed | undefined;
  private readonly off: (() => void)[] = [];

  constructor(scene: Phaser.Scene, link: WorldLink, slips: Slips) {
    this.scene = scene;
    this.link = link;
    this.slips = slips;
    this.records = new DuelRecords(link);
    this.banner = new FloorBanner(scene, () => link.me);
    this.banner.onRound = (winner, end) => this.roundSaid(winner, end);
    this.off.push(
      link.on((e) => {
        if (e.type === "duel") this.onEvent(e.event);
      }),
      onWorld((e) => {
        if (e.t === "place") this.map = e.map;
        else if (e.t === "zones") this.zones = e.zones;
        else if (e.t === "duel") {
          this.floorSaid(this.floor, e.view);
          this.floor = e.view;
          this.feed = e.feed;
        } else return;
        this.refresh();
      }),
    );
  }

  get now(): DuelState {
    return this.state;
  }

  /** The player's own character id. */
  get me(): string | undefined {
    return this.link.me;
  }

  /** Calls `fn` on every change of the state; returns the unsubscribe. */
  on(fn: (s: DuelState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The 결투 key on a player card. */
  challenge(target: { id: string; name: string }): void {
    void ask(
      this.link,
      "duel.challenge",
      { id: target.id },
      { id: "duel.challenge.sent", params: { player: target.name } },
    );
  }

  async queue(mode: DuelMode): Promise<void> {
    await ask(this.link, "duel.queue", { mode });
  }

  async unqueue(): Promise<void> {
    await ask(this.link, "duel.unqueue", {});
  }

  /** 기권, after 권 사감 asks once: the match is written down as lost. */
  async forfeit(): Promise<void> {
    const ask1 = line("duel.over.forfeit-confirm");
    if (ask1) {
      const pick = await worldUi.say([
        { speaker: "sagam", text: ask1, choices: [label("duel-forfeited"), t("social.cancel")] },
      ]);
      if (pick !== 0) return;
    }
    await ask(this.link, "duel.forfeit", {}, { id: "duel.over.forfeit-self" });
  }

  /** Escape: the result card goes first. */
  back(): boolean {
    if (!this.result) return false;
    this.result.close();
    return true;
  }

  /** Out of the way while a menu is open; back when it closes. */
  setVisible(on: boolean): void {
    this.banner.setVisible(on);
  }

  destroy(): void {
    for (const off of this.off) off();
    // Let go of the card first, so closing it redraws nothing.
    const card = this.result;
    this.result = undefined;
    card?.close();
    this.banner.destroy();
    this.slips.drop(RING_SLIP, true);
    this.listeners.clear();
  }

  // ── The floor ─────────────────────────────────────────────────────────────

  private atRing(): boolean {
    const ring = RING.get(this.map);
    return ring !== undefined && this.zones.some((z) => ring.has(z));
  }

  /** This player's side on a floor, 0 when only watching (or out of it). */
  private sideOn(v: FloorView | undefined): number {
    const me = this.link.me;
    const f = v?.fighters.find((x) => x.id === me);
    return f && !f.out ? f.team : 0;
  }

  /** The banner for a fighter, or for whoever watches from the ring; the queue at the ring. */
  private refresh(): void {
    const v = this.floor;
    const fighting = this.sideOn(v) > 0;
    const ring = this.atRing();
    const shown = v && (fighting || ring) ? v : undefined;
    this.banner.set(shown, this.feed);
    if (shown?.phase === "over" && shown.result) this.showResult(shown.match, shown.result);
    const s = this.state;
    // Not over a result card either: the offer waits until the page is put away.
    const free = !s.queue && !s.found && !s.match && !fighting && !this.result;
    // At the rail and free: the two 명단 offered on a slip, like any other offer.
    if (ring && free && !this.slips.has(RING_SLIP)) {
      this.slips.push({
        key: RING_SLIP,
        icon: "duel/mark",
        title: label("duel-challenge"),
        ttl: 24 * 3600_000,
        choices: DUEL_MODES.map((mode) => ({
          label: modeName(mode),
          run: () => void this.queue(mode).then(() => this.refresh()),
        })),
      });
    } else if (!(ring && free)) this.slips.drop(RING_SLIP);
  }

  /** 권 사감's calls as the floor changes: fighters entering, each round on, a fighter leaving. */
  private floorSaid(before: FloorView | undefined, view: FloorView | undefined): void {
    const was = before && before.match !== 0 ? before : undefined;
    const now = view && view.match !== 0 && view.phase !== "idle" ? view : undefined;
    const side = this.sideOn(now ?? was);
    // A fighter's match let go of the floor: everyone goes back where they stood.
    if (was?.phase === "over" && !now && this.sideOn(was) > 0) say("duel.over.return");
    if (!now) return;
    const same = was?.match === now.match ? was : undefined;
    const watching = side === 0;
    if (!watching && now.phase !== same?.phase) {
      if (now.phase === "arriving") say("duel.floor.arriving");
      if (now.phase === "fight") say("duel.floor.start", { count: now.round });
    }
    if (!same || (watching && !this.atRing())) return;
    const me = this.link.me;
    for (const f of now.fighters) {
      const left = f.out && !same.fighters.find((x) => x.id === f.id)?.out;
      if (left && f.id !== me) say("duel.over.forfeit", { player: f.name });
    }
  }

  /** A round decided, as the banner read it: from the player's side, or the ring's. */
  private roundSaid(winner: number, end: RoundEnd): void {
    const side = this.sideOn(this.floor);
    if (side === 0) {
      say(`duel.watch.round.${winner === 0 ? "draw" : winner}`);
      return;
    }
    const how = winner === 0 ? "draw" : winner === side ? "won" : "lost";
    say(`duel.round.${how}.${how === "draw" && end === "forfeit" ? "time" : end}`);
  }

  private showResult(match: number, result: DuelResultView): void {
    if (this.shown.includes(match)) return;
    this.shown.push(match);
    if (this.shown.length > 8) this.shown.shift();
    const team = result.fighters.find((f) => f.id === this.link.me)?.team ?? 0;
    if (team === 0) say(`duel.watch.over.${result.winner === 0 ? "draw" : result.winner}`);
    else say(`duel.over.${result.winner === 0 ? "draw" : result.winner === team ? "won" : "lost"}`);
    this.result?.close();
    const card = new ResultCard(this.scene, match, result, this.link.me, () => {
      if (this.result !== card) return;
      this.result = undefined;
      this.refresh();
    });
    this.result = card;
    this.refresh();
  }

  // ── The WorldRoom's pushes ────────────────────────────────────────────────

  private set(next: Partial<DuelState>): void {
    this.state = { ...this.state, ...next };
  }

  private onEvent(e: DuelEvent): void {
    const link = this.link;
    const s = this.state;
    switch (e.t) {
      case "challenged":
        if (link.isBlocked(e.from.id)) return;
        this.challenges.set(e.id, { name: e.from.name, mine: false });
        this.slips.push({
          key: `duel:${e.id}`,
          icon: "duel/mark",
          title: e.from.name,
          sub: label("duel-challenge"),
          expiresAt: e.expiresAt,
          choices: [
            {
              label: label("duel-accept"),
              ink: true,
              run: () => void ask(link, "duel.accept", { id: e.id }),
            },
            {
              label: label("duel-decline"),
              run: () => void ask(link, "duel.decline", { id: e.id }),
            },
          ],
        });
        break;
      case "challenge":
        this.challenges.set(e.id, { name: e.to.name, mine: true });
        this.set({ out: { id: e.id, to: e.to } });
        this.slips.push({
          key: `duel:${e.id}`,
          icon: "duel/mark",
          title: e.to.name,
          sub: label("duel-challenge"),
          expiresAt: e.expiresAt,
          choices: [
            { label: label("duel-withdraw"), run: () => void ask(link, "duel.withdraw", {}) },
          ],
        });
        break;
      case "challengeEnded": {
        this.slips.drop(`duel:${e.id}`);
        const c = this.challenges.get(e.id);
        this.challenges.delete(e.id);
        if (s.out?.id === e.id) this.set({ out: null });
        // Whose own answer or silence ended it hears the `-self` line; the other, who did it.
        const self =
          e.why === "withdrawn" ? c?.mine === true : e.why !== "busy" && c !== undefined && !c.mine;
        say(`duel.challenge.${e.why}${self ? "-self" : ""}`, { player: c?.name ?? "" });
        break;
      }
      case "queued": {
        this.set({ queue: { mode: e.mode, since: e.since, with: e.with } });
        if (this.requeued) say("duel.queue.back");
        else if (e.with.length > 0)
          say("duel.queue.joined.party", { names: e.with.map((p) => p.name).join(", ") });
        else say(`duel.queue.joined.${e.mode}`);
        this.requeued = false;
        this.slips.push({
          key: "duel:queue",
          icon: "duel/mark",
          title: modeName(e.mode),
          since: e.since,
          ttl: 24 * 3600_000,
          choices: [{ label: label("duel-unqueue"), run: () => void this.unqueue() }],
        });
        break;
      }
      case "unqueued":
        this.set({ queue: null });
        this.slips.drop("duel:queue");
        if (e.why !== "found") say(`duel.queue.${e.why}`);
        break;
      case "found":
        this.set({ found: { ...e, accepted: [] } });
        this.refused = 0;
        cue("sfx.field.bell", { volume: 0.6 });
        say(`duel.found.${e.mode}`);
        this.foundSlip();
        break;
      case "ready":
        if (!s.found || s.found.id !== e.id) return;
        this.set({ found: { ...s.found, accepted: e.accepted } });
        this.foundSlip();
        break;
      case "cancelled": {
        this.slips.drop(`duel:found:${e.id}`);
        const me = link.me ?? "";
        const answered = s.found?.id === e.id && s.found.accepted.includes(me);
        // Whoever refused, or let the 점호 lapse, is off the 명단 for a while: said as a clock time.
        const blamed =
          (e.why === "refused" && this.refused === e.id) ||
          (e.why === "lapsed" && s.found?.id === e.id && !answered);
        const time = clock(Date.now() + DUEL_QUEUE_LOCK_SECONDS * 1000);
        say(`duel.cancelled.${e.why}${blamed ? "-self" : ""}`, { time });
        this.requeued = answered;
        if (s.found?.id === e.id) this.set({ found: null });
        if (s.match?.id === e.id) this.set({ match: null });
        break;
      }
      case "match":
        if (s.found) this.slips.drop(`duel:found:${s.found.id}`);
        if (s.out) this.slips.drop(`duel:${s.out.id}`);
        this.set({
          found: null,
          out: null,
          match: { id: e.id, mode: e.mode, you: e.you, sides: e.sides },
        });
        say("duel.floor.match");
        break;
      case "over":
        if (s.match?.id === e.id) this.set({ match: null });
        this.records.forget(e.result.fighters.map((f) => f.id));
        // Whoever is not watching this floor (sent home after leaving it) reads it here.
        if (this.banner.match !== e.id) this.showResult(e.id, e.result);
        break;
      case "record":
        // As written: a win past the day's cap counts as played only, and shows so.
        if (link.me) this.records.set(link.me, e.record);
        break;
    }
    for (const l of this.listeners) l(this.state);
    this.refresh();
  }

  /** The 점호: 출석 and 불참 until the player answers, then how many have answered. */
  private foundSlip(): void {
    const f = this.state.found;
    if (!f) return;
    const me = this.link.me;
    const total = f.sides[0].length + f.sides[1].length;
    const mine = me !== undefined && f.accepted.includes(me);
    const count = line("duel.ready.count", { count: f.accepted.length, total });
    const link = this.link;
    this.slips.push({
      key: `duel:found:${f.id}`,
      icon: "duel/mark",
      title: modeName(f.mode),
      ...(count ? { sub: count } : {}),
      expiresAt: f.expiresAt,
      ...(mine
        ? {}
        : {
            choices: [
              {
                label: label("duel-ready"),
                ink: true,
                run: () => void ask(link, "duel.ready", { id: f.id }, { id: "duel.ready.self" }),
              },
              {
                label: label("duel-refuse"),
                run: () => {
                  this.refused = f.id;
                  void ask(link, "duel.refuse", { id: f.id });
                },
              },
            ],
          }),
    });
  }
}

/**
 * The notebook's 결투 page: the player's record, the two 명단 (or the wait in one and 신청 취소),
 * 기권 while a match is on, and 권 사감's four rules under them.
 */
export function duelTab(duels: () => Duels | undefined, order = 72): MenuTab {
  return {
    id: "duel",
    label: t("social.duel"),
    icon: "duel/mark",
    order,
    build(ctx, page, size) {
      const d = duels();
      if (d) new DuelPage(ctx, page, size, d);
    },
  };
}

const RULES = ["rounds", "even", "leave", "stakes"] as const;

class DuelPage {
  private readonly ctx: Ctx;
  private readonly duels: Duels;
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly size: { w: number; h: number };
  private clock: Label | undefined;
  private timer: Phaser.Time.TimerEvent | undefined;

  constructor(
    ctx: Ctx,
    page: Phaser.GameObjects.Container,
    size: { w: number; h: number },
    duels: Duels,
  ) {
    this.ctx = ctx;
    this.duels = duels;
    this.size = size;
    this.root = ctx.scene.add.container(0, 0);
    this.body = ctx.scene.add.container(0, 0);
    this.root.add(this.body);
    page.add(this.root);
    const offState = duels.on(() => this.draw());
    const offRecord = duels.records.on(() => this.draw());
    this.timer = ctx.scene.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => {
        const q = duels.now.queue;
        if (q && this.clock) this.clock.set(waited(q.since));
      },
    });
    this.root.once(Phaser.GameObjects.Events.DESTROY, () => {
      offState();
      offRecord();
      this.timer?.remove();
    });
    this.draw();
  }

  private draw(): void {
    const { scene } = this.ctx;
    for (const obj of [...this.body.list]) obj.destroy();
    this.clock = undefined;
    const { w } = this.size;
    const cx = Math.round(w / 2);
    const id = this.duels.me;
    const record = id ? this.duels.records.get(id) : undefined;

    // The record, as 결투 전적 and `3전 2승`.
    const top = 26;
    const head = new Label(scene, 0, 0, label("duel-record"), {
      font: "galmuri9",
      color: "stone.dark",
    });
    const value = new Label(scene, 0, 0, recordText(record ?? { played: 0, won: 0 }), {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    const rowW = 16 + 5 + head.width + 8 + value.width;
    const x = cx - Math.round(rowW / 2);
    this.body.add(scene.add.image(x, top - 4, "ui", "duel/mark").setOrigin(0));
    head.at(x + 21, top + 1);
    value.at(x + 21 + head.width + 8, top);
    this.body.add([head.obj, value.obj]);

    // The 명단, the wait in one, or 기권 while a match is on.
    const s = this.duels.now;
    const by = top + 30;
    const bw = 84;
    if (s.match) {
      this.body.add(
        new Button(this.ctx, cx - bw / 2, by, {
          label: label("duel-forfeited"),
          w: bw,
          h: 28,
          onPress: () => {
            // The notebook steps aside for 권 사감's question.
            this.ctx.scope.onBack?.();
            void this.duels.forfeit();
          },
        }),
      );
    } else if (s.queue) {
      const mode = new Label(scene, 0, 0, modeName(s.queue.mode), {
        font: "galmuri9",
        color: "stone.dark",
      });
      const clockLabel = new Label(scene, 0, 0, waited(s.queue.since), {
        font: "galmuri11-bold",
        color: "ink.dark",
      });
      // The mode and how long it has waited, then 신청 취소, as one row in the middle.
      const cw = mode.width + 8 + 34;
      const left = cx - Math.round((cw + 8 + bw) / 2);
      mode.at(left, by + 9);
      clockLabel.at(left + mode.width + 8, by + 8);
      this.clock = clockLabel;
      this.body.add([mode.obj, clockLabel.obj]);
      this.body.add(
        new Button(this.ctx, left + cw + 8, by, {
          label: label("duel-unqueue"),
          w: bw,
          h: 28,
          sound: "close",
          onPress: () => void this.duels.unqueue(),
        }),
      );
    } else {
      const busy = s.found !== null;
      DUEL_MODES.forEach((mode, i) => {
        const b = new Button(this.ctx, cx - bw - 4 + i * (bw + 8), by, {
          label: modeName(mode),
          kind: "ink",
          w: bw,
          h: 28,
          sound: "confirm",
          onPress: () => void this.duels.queue(mode),
        });
        if (busy) b.setEnabled(false);
        this.body.add(b);
      });
    }

    // 권 사감's rules, ruled off under the buttons.
    let ry = by + 46;
    this.body.add(scene.add.rectangle(16, ry - 8, w - 32, 1, paint("stone.light")).setOrigin(0));
    for (const rule of RULES) {
      const text = line(`duel.rules.${rule}`);
      if (!text) continue;
      const l = new Label(scene, 24, ry, text, {
        font: "galmuri9",
        color: "ink.dark",
        width: w - 48,
      });
      this.body.add(l.obj);
      ry += l.height + 4;
    }
  }
}
