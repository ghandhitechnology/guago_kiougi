/**
 * The fight as the HUD reads it, and what the HUD can ask of it. One object, updated in place
 * every frame by the fight view; widgets read it and never write it.
 */

export interface BookState {
  /** Book id (`wangdo`), its icon frame in the `ui` atlas (`book/wangdo`) and its class. */
  readonly id: string;
  readonly icon: string;
  readonly cls: string;
  /** Ready to cast. In the modes where books cast themselves this still shows the cycle. */
  ready: boolean;
  /** Share of the cooldown left, 1 just cast to 0 ready. */
  cooldown: number;
  /** Seconds the cooldown runs, as last measured. */
  seconds: number;
}

export interface StatusState {
  readonly id: string;
  readonly left: number;
}

export type WavePhase = "surge" | "lull";

export interface TargetState {
  readonly id: number;
  /** Monster id (`odap`) for its name and portrait. */
  readonly monster: string;
  readonly elite: boolean;
  /** Share of HP left when the wire carries it (elites and bosses), else null. */
  readonly hp: number | null;
  readonly x: number;
  readonly y: number;
}

export interface FightState {
  /** Seated and drawn: the rest means something. */
  ready: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  exp: number;
  /** EXP the current level takes. */
  expToNext: number;
  level: number;
  /** `CONTROL_MODES` index: 0 완전 자동, 1 반자동, 2 스킬 수동, 3 완전 수동. */
  mode: number;
  /** Whether the player casts books by hand, and dodges by hand, in this mode. */
  manualBooks: boolean;
  manualDodge: boolean;
  /** The book left click casts. */
  picked: number;
  books: BookState[];
  dodge: { ready: boolean; cooldown: number; rolling: boolean };
  /** Knocked out: since when (ms, local clock), whether someone is reviving, seconds until waking. */
  down: { on: boolean; since: number; reviving: boolean; wakeIn: number };
  /** Someone within reach is down: E revives them. */
  canRevive: boolean;
  statuses: StatusState[];
  wave: { phase: WavePhase; since: number; left: number };
  target: TargetState | null;
  /** Kills in the current streak. */
  streak: number;
}

/** What the HUD's buttons, the fan and the joystick call. */
export interface FightActions {
  /** Casts the book in `slot` (완전 수동), or picks it for left click. */
  cast(slot: number): void;
  dodge(): void;
  /** Next control mode, in `CONTROL_MODES` order. */
  cycleMode(): void;
  setMode(mode: number): void;
  /** Aims at a world point; `null` gives aim back to the server. */
  aimAt(x: number, y: number): void;
  clearAim(): void;
  /** Revives whoever is down within reach. */
  revive(): void;
}

export function emptyState(): FightState {
  return {
    ready: false,
    hp: 0,
    maxHp: 1,
    shield: 0,
    exp: 0,
    expToNext: 1,
    level: 1,
    mode: 1,
    manualBooks: false,
    manualDodge: false,
    picked: 0,
    books: [],
    dodge: { ready: true, cooldown: 0, rolling: false },
    down: { on: false, since: 0, reviving: false, wakeIn: 0 },
    canRevive: false,
    statuses: [],
    wave: { phase: "surge", since: 0, left: 0 },
    target: null,
    streak: 0,
  };
}
