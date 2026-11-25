/**
 * One dueling floor in one map room (PLAN §14): the room's channel of the 새벽관 holds one
 * match at a time on its 콜로세움, and the players standing in the corridor ring watch it
 * through the room's ordinary snapshot. Several matches run at once on several channels.
 *
 * The host reserves the floor for a match the hub made, shuts the ring, waits for the fighters
 * to arrive, puts the duel kit on each (`duelKit`), runs the match in the room's own fight step
 * (`DuelFloor`), tells everyone in the room what the floor is doing, and hands the result to the
 * hub, which sends everyone back. Nothing here touches the database.
 */
import {
  type Arena,
  DUEL_ARRIVE_SECONDS,
  DUEL_NORMS,
  DUEL_RESULT_SECONDS,
  DUEL_TIMING,
  duelMarks,
} from "@guago/content";
import {
  DUEL_MESSAGES,
  DuelFloor,
  type DuelMode,
  DuelPhase,
  type DuelResult,
  type DuelResultView,
  type FightWorld,
  type FloorPhase,
  type FloorView,
  Mode,
  type Player,
  type PlayerKit,
  RoundEnd,
  snap,
  TICK_RATE_HZ,
  ticks,
} from "@guago/shared";

/** What the map room lends the floor: its world, its bodies, its walls and its messages. */
export interface FloorRoom {
  readonly roomId: string;
  readonly mapId: string;
  readonly channel: number;
  readonly world: FightWorld;
  /** The character's body here and its session id. */
  bodyOf(characterId: string): { player: Player; sid: string } | undefined;
  /** Every character seated here. */
  seated(): Iterable<{ characterId: string; player: Player }>;
  broadcast(type: string, body: unknown): void;
  send(sid: string, type: string, body: unknown): void;
  /** Shuts or opens the ring round the floor, on the server's walls and in `MapState.fenced`. */
  fence(arena: string, on: boolean): void;
  /** The character's duel kit at `mode` from what it wears, or undefined. */
  duelKit(characterId: string, mode: Mode): PlayerKit | undefined;
  /** Its own kit, mode-free level and party, back after a match. */
  unarm(characterId: string): void;
  /** Where people watch from: the gallery spot a player is put on when it must leave the floor. */
  readonly gallery: { x: number; y: number };
}

/** The match the hub made, as the floor needs it. */
export interface FloorMatch {
  readonly id: number;
  readonly mode: DuelMode;
  /** Character ids by side. */
  readonly sides: readonly [readonly string[], readonly string[]];
  readonly names: ReadonlyMap<string, string>;
}

/** What the floor tells the hub. */
export interface FloorEvents {
  over(match: FloorMatch, result: DuelResultView): void;
  /** The floor let go of its match (after the result, or when it could not start). */
  released(match: FloorMatch): void;
}

/** A fighter as the floor keeps it: what it had before the match, to give back. */
interface Armed {
  readonly characterId: string;
  readonly player: Player;
  readonly sid: string;
  readonly level: number;
  readonly mode: Mode;
  /** Health as a share of the kit: a duel heals nobody. */
  readonly hpShare: number;
}

type HostPhase = "idle" | "arriving" | "live" | "over";

const PHASE: Readonly<Record<number, FloorPhase>> = {
  [DuelPhase.Idle]: "idle",
  [DuelPhase.Countdown]: "countdown",
  [DuelPhase.Fight]: "fight",
  [DuelPhase.Pause]: "pause",
  [DuelPhase.Over]: "over",
};
const END = ["ko", "time", "forfeit"] as const;

export class FloorHost {
  readonly arena: Arena;
  readonly floor: DuelFloor;
  private readonly room: FloorRoom;
  private readonly events: FloorEvents;
  private phase: HostPhase = "idle";
  private match: FloorMatch | null = null;
  /** Fight tick by which everyone must have arrived, or the result stops showing. */
  private deadline = 0;
  private readonly armed = new Map<string, Armed>();
  /** Every fighter's session when the match started, for the result: kept after a forfeit. */
  private readonly sessions = new Map<string, string>();
  /** Fighters who left before or during the match. */
  private readonly gone = new Set<string>();
  private result: DuelResultView | null = null;
  /** The phase last logged. */
  private told: FloorPhase = "idle";

  constructor(room: FloorRoom, arena: Arena, events: FloorEvents) {
    this.room = room;
    this.arena = arena;
    this.events = events;
    this.floor = new DuelFloor(room.world, arena.rect, DUEL_NORMS, DUEL_TIMING);
  }

  get busy(): boolean {
    return this.phase !== "idle";
  }

  get matchId(): number {
    return this.match?.id ?? 0;
  }

  /** Takes the floor for a match: shuts the ring and waits for the fighters. */
  reserve(match: FloorMatch): boolean {
    if (this.busy) return false;
    this.match = match;
    this.phase = "arriving";
    this.armed.clear();
    this.sessions.clear();
    this.gone.clear();
    this.result = null;
    this.deadline = this.room.world.tick + ticks(DUEL_ARRIVE_SECONDS);
    this.room.fence(this.arena.id, true);
    this.clearFloor();
    this.tell();
    return true;
  }

  /** Whether a character fights the match on this floor and has not left it. */
  fights(characterId: string): boolean {
    return this.match !== null && this.sideOf(characterId) > 0 && !this.gone.has(characterId);
  }

  /** A character took a seat in this room: a fighter on the way has arrived; others see the floor. */
  seatedHere(characterId: string): void {
    const body = this.room.bodyOf(characterId);
    if (body) this.room.send(body.sid, DUEL_MESSAGES.floor, this.view());
    if (this.phase === "arriving" && this.fights(characterId)) this.tryStart();
  }

  /**
   * A fighter's seat here is going (a door, a drop, 명령퇴사, a logout): it is out of the match
   * at once and does not come back into it, so pulling the plug never resets a round.
   */
  leaving(characterId: string): void {
    if (!this.fights(characterId)) return;
    this.forfeit(characterId);
  }

  /** A fighter is out for good: conceded, dropped or never arrived. */
  forfeit(characterId: string): boolean {
    if (!this.fights(characterId)) return false;
    this.gone.add(characterId);
    const a = this.armed.get(characterId);
    if (a && this.phase === "live") {
      this.floor.forfeit(this.room.world, a.sid);
      this.giveBack(a);
      // Off the floor and into the gallery, where everyone else watches from.
      if (a.player.joined && a.player.id === a.sid) this.put(a.player, this.room.gallery);
    }
    if (this.phase === "arriving") this.tryStart();
    this.tell();
    return true;
  }

  /** After each step: arrivals, the match, the result, and anyone who strayed onto the floor. */
  tick(): void {
    const w = this.room.world;
    if (this.phase === "idle") return;
    if (this.phase === "arriving" && w.tick >= this.deadline) {
      for (const id of [...(this.match?.sides[0] ?? []), ...(this.match?.sides[1] ?? [])]) {
        if (!this.room.bodyOf(id)) this.gone.add(id);
      }
      this.tryStart();
    }
    if (this.phase === "live") {
      this.clearFloor();
      if (this.floor.phase === DuelPhase.Over && this.floor.result) this.decided(this.floor.result);
    }
    if (this.phase === "over" && w.tick >= this.deadline) this.release();
    if (this.floor.changed) {
      this.floor.changed = false;
      this.tell();
    }
  }

  /** Gives the fighters back their own kits and lets go of the floor. The hub sends them home. */
  release(): void {
    const match = this.match;
    for (const a of this.armed.values()) this.giveBack(a);
    this.armed.clear();
    this.floor.clear(this.room.world);
    this.floor.changed = false;
    this.phase = "idle";
    this.match = null;
    this.result = null;
    this.room.fence(this.arena.id, false);
    this.tell();
    if (match) this.events.released(match);
  }

  /** What the floor looks like now, for everyone in the room. */
  view(): FloorView {
    const m = this.match;
    const f = this.floor;
    const phase: FloorPhase =
      this.phase === "idle"
        ? "idle"
        : this.phase === "arriving"
          ? "arriving"
          : (PHASE[f.phase] ?? "idle");
    return {
      arena: this.arena.id,
      match: m?.id ?? 0,
      mode: m?.mode ?? "",
      phase,
      round: this.phase === "live" || this.phase === "over" ? f.round : 0,
      score: [f.score[1] ?? 0, f.score[2] ?? 0],
      endsAt: this.phase === "arriving" ? this.deadline : this.phase === "live" ? f.phaseEnds : 0,
      fighters: m
        ? m.sides.flatMap((side, i) =>
            side.map((id) => ({
              id,
              name: m.names.get(id) ?? "",
              sid: this.room.bodyOf(id)?.sid ?? "",
              team: i + 1,
              out: this.gone.has(id),
            })),
          )
        : [],
      ...(this.result ? { result: this.result } : {}),
    };
  }

  // ── Inside ─────────────────────────────────────────────────────────────────

  private sideOf(characterId: string): number {
    const m = this.match;
    if (!m) return 0;
    return m.sides[0].includes(characterId) ? 1 : m.sides[1].includes(characterId) ? 2 : 0;
  }

  /** Starts once every fighter is here or gone; a side with nobody here loses without a fight. */
  private tryStart(): void {
    const m = this.match;
    if (!m || this.phase !== "arriving") return;
    const all = [...m.sides[0], ...m.sides[1]];
    const waiting = all.some((id) => !this.gone.has(id) && !this.room.bodyOf(id));
    if (waiting) return;
    const present = all.filter((id) => !this.gone.has(id) && this.room.bodyOf(id));
    const sides = [1, 2].map((t) => present.filter((id) => this.sideOf(id) === t));
    if ((sides[0]?.length ?? 0) === 0 || (sides[1]?.length ?? 0) === 0) {
      const winner = (sides[0]?.length ?? 0) > 0 ? 1 : (sides[1]?.length ?? 0) > 0 ? 2 : 0;
      this.decided({
        winner,
        rounds: [{ winner, ticks: 0, end: RoundEnd.Forfeit }],
        ticks: 0,
        fighters: [],
      });
      return;
    }
    const marks = duelMarks(this.arena, m.mode);
    const used = [0, 0, 0];
    const entries: Parameters<DuelFloor["start"]>[1][number][] = [];
    for (const id of present) {
      const body = this.room.bodyOf(id);
      if (!body) continue;
      const p = body.player;
      const team = this.sideOf(id);
      const mode = p.mode === Mode.Manual ? Mode.Manual : Mode.Semi;
      const kit = this.room.duelKit(id, mode);
      if (!kit) continue;
      this.sessions.set(body.sid, id);
      this.armed.set(id, {
        characterId: id,
        player: p,
        sid: body.sid,
        level: p.level,
        mode: p.mode,
        hpShare: p.down ? 1 : p.hp / p.kit.maxHp,
      });
      // 완전 자동 and 스킬 수동 fight in 반자동: the server never moves a fighter.
      p.mode = mode;
      p.level = DUEL_NORMS.level;
      p.casts = 0;
      this.room.world.setKit(p, kit);
      const mark = marks.filter((k) => k.team === team)[used[team] ?? 0] ?? marks[0];
      used[team] = (used[team] ?? 0) + 1;
      entries.push({ player: p, team, mark: { x: mark?.x ?? 0, y: mark?.y ?? 0 } });
    }
    this.phase = "live";
    this.floor.start(this.room.world, entries);
    this.tell();
  }

  private decided(r: DuelResult): void {
    const m = this.match;
    if (!m || this.phase === "over") return;
    const seen = new Set<string>();
    const fighters: DuelResultView["fighters"] = r.fighters.map((f) => {
      const id = this.sessions.get(f.id) ?? "";
      seen.add(id);
      return {
        id,
        name: m.names.get(id) ?? "",
        team: f.team,
        damage: Math.round(f.damage),
        hits: f.hits,
        downs: f.downs,
        forfeited: f.forfeited || this.gone.has(id),
      };
    });
    // Whoever never made it to the floor is in the result too, as having forfeited.
    m.sides.forEach((side, i) => {
      for (const id of side) {
        if (seen.has(id)) continue;
        fighters.push({
          id,
          name: m.names.get(id) ?? "",
          team: i + 1,
          damage: 0,
          hits: 0,
          downs: 0,
          forfeited: true,
        });
      }
    });
    this.result = {
      winner: r.winner,
      rounds: r.rounds.map((x) => ({
        winner: x.winner,
        seconds: Math.round((x.ticks / TICK_RATE_HZ) * 10) / 10,
        end: END[x.end] ?? "ko",
      })),
      seconds: Math.round((r.ticks / TICK_RATE_HZ) * 10) / 10,
      fighters,
    };
    this.phase = "over";
    this.deadline = this.room.world.tick + ticks(DUEL_RESULT_SECONDS);
    this.tell();
    this.events.over(m, this.result);
  }

  /** A fighter's own kit, level, mode and health back. */
  private giveBack(a: Armed): void {
    if (!this.armed.has(a.characterId)) return;
    this.armed.delete(a.characterId);
    const p = a.player;
    if (!p.joined || p.id !== a.sid) return;
    p.level = a.level;
    p.mode = a.mode;
    p.casts = 0;
    this.room.unarm(a.characterId);
    p.hp = Math.max(1, Math.min(p.kit.maxHp, a.hpShare * p.kit.maxHp));
    p.downAt = -1;
    p.shield = 0;
  }

  /** Nobody but the fighters stands on a floor with a match on it. */
  private clearFloor(): void {
    for (const { characterId, player } of this.room.seated()) {
      if (this.fights(characterId)) continue;
      if (this.floor.contains(player.x, player.y)) this.put(player, this.room.gallery);
    }
  }

  private put(p: Player, at: { x: number; y: number }): void {
    p.x = snap(at.x);
    p.y = snap(at.y);
    p.forceTicks = 0;
    p.rollLeft = 0;
  }

  private tell(): void {
    const view = this.view();
    if (view.phase !== this.told) {
      this.told = view.phase;
      console.log(
        JSON.stringify({
          duel: {
            room: this.room.roomId,
            match: view.match,
            phase: view.phase,
            round: view.round,
            score: view.score,
          },
        }),
      );
    }
    this.room.broadcast(DUEL_MESSAGES.floor, view);
  }
}
