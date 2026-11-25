/**
 * Shapes for every word a player reads in the hub and in Page 1. Text is never stored inline:
 * each field holds a key into the locale table, and Korean is the only locale (PLAN decision 11).
 * The client renders, the server triggers; neither writes copy.
 */

/** A key into the locale table, e.g. `opening.b3-page.1`. */
export type TextKey = string;
/** One locale: key to text. */
export type Strings = Readonly<Record<TextKey, string>>;

/**
 * Speech level. One per speaker, never mixed (CLAUDE.md "No AI feel").
 * - `hapsyo` 합쇼체 and `haeyo` 해요체 are 존댓말.
 * - `banmal` covers 해체 and 해라체, which a 반말 speaker mixes freely.
 * - `hage` 하게체, the dubbed elder's voice ("자네", "-네", "-게").
 * - `none` is written text with no voice: signs, log books, notices.
 */
export type Register = "hapsyo" | "haeyo" | "hage" | "banmal" | "none";

export interface Speaker {
  readonly id: string;
  readonly name: TextKey;
  readonly register: Register;
  /** Actor that stands on the map for this voice, when it differs from `id`. */
  readonly actor?: string;
  /** Portrait sprite in the art atlas, once drawn. */
  readonly portrait?: string;
  /** Portrait expressions a line may ask for. The first is the default. */
  readonly faces: readonly string[];
  /** Writer-facing notes, never shown. */
  readonly role: string;
  readonly habits: readonly string[];
  readonly never: readonly string[];
  /** Three lines that carry the voice. */
  readonly samples: readonly TextKey[];
  /** The voice test: this speaker hears the cafeteria ran out of 돈가스. */
  readonly donkatsu: TextKey;
}

export interface Line {
  readonly speaker: string;
  readonly face?: string;
  readonly text: TextKey;
  /** Replies the player picks from. Each option is the player's line, then what follows it. */
  readonly choice?: readonly Option[];
}

export interface Option {
  readonly text: TextKey;
  readonly reply: readonly Line[];
}

/** A written page shown full screen: a log book, the notebook, a notice. */
export interface Doc {
  readonly title?: TextKey;
  readonly rows: readonly DocRow[];
}

export interface DocRow {
  readonly text: TextKey;
  /** Whose hand wrote the row. `stranger` is the notebook's handwriting nobody recognises. */
  readonly hand?: "print" | "student" | "stranger" | "seoha";
}

export type Dir = "up" | "down" | "left" | "right";

/** Effects the client plays by id. */
export const EFFECTS = [
  "fade-in",
  "fade-out",
  "shake",
  "flash",
  "hum",
  "lights-flicker",
  "lights-out",
  "rift-column",
  "columns-rise",
  "page-gust",
  "book-glow",
  "odap-surge",
  "fault-crack",
  "golem-rise",
  "drop-pop",
  "freeze-field",
  "unfreeze-field",
  "diagonal-glow",
  "grid-dissolve",
  "limit-rings",
  "dash-arrive",
  "ice-spread",
  "block-slide",
  "theory-break",
  "two-stones",
  "page-return",
] as const;
export type Effect = (typeof EFFECTS)[number];

/** Sounds and music cues the audio package answers to. `null` music is silence. */
export const SOUND_CUES = [
  "fluorescent",
  "floor-hum",
  "page-flutter",
  "odap-swarm",
  "whistle",
  "wake-song",
  "chalk",
  "sea",
  "ice",
  "stone-land",
] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

export const MUSIC = [
  "night-study",
  "rift-first",
  "school-theme",
  "agora",
  "boss-mid",
  "boss-era",
  "home",
] as const;
export type Music = (typeof MUSIC)[number];

/**
 * Tutorial prompts are icons only, drawn at a spot: the client shows the key on desktop and
 * the button on phones (PLAN §6 "Input"). No sentence ever tells the player which key to press.
 */
export const PROMPTS = ["move", "interact", "dodge", "mode", "book"] as const;
export type Prompt = (typeof PROMPTS)[number];

/** One step of a scripted scene. Steps run in order; `play` hands control back to the player. */
export type Step =
  | { readonly do: "say"; readonly line: Line }
  | { readonly do: "bubble"; readonly line: Line }
  | { readonly do: "camera"; readonly to: string; readonly ms: number }
  | { readonly do: "move"; readonly actor: string; readonly to: string; readonly ms?: number }
  | { readonly do: "face"; readonly actor: string; readonly dir: Dir }
  | { readonly do: "anim"; readonly actor: string; readonly anim: string }
  | { readonly do: "fx"; readonly fx: Effect; readonly at?: string }
  | { readonly do: "sound"; readonly cue: SoundCue }
  | { readonly do: "music"; readonly track: Music | null }
  | { readonly do: "wait"; readonly ms: number }
  | { readonly do: "show"; readonly doc: Doc }
  | { readonly do: "system"; readonly message: string }
  | {
      readonly do: "play";
      /** Condition the server checks, `verb:target`: `near:cooler`, `defeat:golem`. */
      readonly until: string;
      readonly prompt?: Prompt;
      readonly at?: string;
    }
  /** An optional talk at a spot, open until the next `play` ends. */
  | { readonly do: "offer"; readonly at: string; readonly lines: readonly Line[] }
  | { readonly do: "title"; readonly lines: readonly TextKey[] };

export interface Cutscene {
  readonly id: string;
  /** Map the scene is staged on. */
  readonly map: string;
  /** Actors on stage: speaker ids, `player`, monster and prop ids. */
  readonly cast: readonly string[];
  /** Named spots on the map that steps refer to. The map defines them. */
  readonly marks: readonly string[];
  readonly steps: readonly Step[];
}

export interface OpeningBeat {
  readonly id: string;
  /** Writer-facing: what the beat teaches (PLAN §4 "Opening sequence"). */
  readonly teaches: string;
  readonly scene: Cutscene;
}

/**
 * Server milestones of Page 1 in order (PLAN §10 "Page lifecycle"). Barks, beats and quest
 * templates switch on them.
 */
export const MILESTONES = [
  "opening",
  "p1.open",
  "p1.wide",
  "p1.pythagoreans",
  "p1.pythagoreans-freed",
  "p1.zeno",
  "p1.zeno-freed",
  "p1.aristotle",
  "p1.aristotle-freed",
  "p1.era-change",
] as const;
export type Milestone = (typeof MILESTONES)[number];

export interface StoryBeat {
  readonly id: string;
  /** Page lifecycle week the beat belongs to; `14` is the 시대 전환 week. */
  readonly week: number;
  readonly after: Milestone;
  readonly title: TextKey;
  readonly map: string;
  readonly lines?: readonly Step[];
  readonly cutscene?: string;
  /** Server announcement that goes out when the milestone is reached. */
  readonly announce?: readonly string[];
}

/** What happened in a boss fight that a line answers. */
export const FIGHT_CUES = [
  "enter",
  "start",
  "phase",
  "hp-50",
  "hp-25",
  "knockout",
  "debate-hour",
  "grid-step",
  "diagonal",
  "weak-open",
  "dash",
  "ring-filled",
  "arrow",
  "tortoise",
  "fall",
  "element-zone",
  "push",
  "unpushed",
  "ice",
] as const;
export type FightCue = (typeof FIGHT_CUES)[number];

export interface FightLine {
  readonly on: FightCue;
  /** 1-based phase (논제) the line belongs to, for bosses with phases. */
  readonly phase?: number;
  readonly lines: readonly Line[];
}

export interface BossScript {
  readonly boss: string;
  readonly map: string;
  /** Phase titles: the era boss's four 논제. */
  readonly theses?: readonly TextKey[];
  readonly fight: readonly FightLine[];
  readonly freed: string;
}

export type Unlock =
  | { readonly when: "freed"; readonly boss: string }
  | { readonly when: "met"; readonly speaker: string }
  | { readonly when: "kills"; readonly monsters: readonly string[]; readonly count: number }
  | { readonly when: "crafted"; readonly book: string }
  | { readonly when: "visited"; readonly place: string };

interface CodexBase {
  readonly id: string;
  readonly name: TextKey;
  readonly unlock: Unlock;
  /** Where each claim was checked. Never shown. */
  readonly sources: readonly string[];
}

/** PLAN §15: who they were, what they got right, the wrong theory, what replaced it and who. */
export interface ScientistEntry extends CodexBase {
  readonly section: "scientist";
  readonly era: TextKey;
  readonly who: TextKey;
  readonly right: TextKey;
  readonly wrong: TextKey;
  readonly replaced: TextKey;
}

/** The misconception a monster stands for, in two sentences. */
export interface MisconceptionEntry extends CodexBase {
  readonly section: "misconception";
  readonly body: TextKey;
}

export interface BookEntry extends CodexBase {
  readonly section: "book";
  readonly flavor: TextKey;
  readonly concept: TextKey;
}

export interface SchoolEntry extends CodexBase {
  readonly section: "school";
  readonly body: TextKey;
}

export type CodexEntry = ScientistEntry | MisconceptionEntry | BookEntry | SchoolEntry;

export interface Bark {
  readonly speaker: string;
  readonly text: TextKey;
  readonly from: Milestone;
  readonly until?: Milestone;
  /** Map the line is said on, when it belongs to one place. */
  readonly where?: string;
}

export interface Description {
  readonly id: string;
  /** `meal` ids are `meal:<menu id>` (lifecycle.ts MEALS); the description is the buff line. */
  readonly kind: "place" | "station" | "item" | "prop" | "monster" | "npc" | "meal";
  readonly name: TextKey;
  readonly desc: TextKey;
}

/** A name with no description: a status, a mode, a grade, a nameplate. Fits one row. */
export interface Term {
  readonly id: string;
  readonly kind:
    | "status"
    | "reaction"
    | "mode"
    | "stat"
    | "grade"
    | "class"
    | "tier"
    | "monster"
    | "label"
    /** Emote wheel names, by `EMOTES` id. */
    | "emote"
    /** 대자보 sections, by `BOARD_CATEGORIES` id and `notice`. */
    | "board"
    /** Report categories, by `REPORT_CATEGORIES` id. */
    | "report"
    /** 도감 set names, by `CODEX_SETS` id. */
    | "set"
    /** Badges worn on a nameplate: 층장. */
    | "badge"
    /** Club ranks (`CLUB_RANKS`) and join rules (`JOIN_RULES`). */
    | "rank"
    | "join"
    /** 상벌점 ledger reasons, as the ledger stores them (`knockout`, `merit.cancel`, `expel`). */
    | "conduct"
    /** 매점 게시판 browse categories, by `LISTING_CATEGORIES` id. */
    | "listing";
  readonly name: TextKey;
}

/** Values a template or message fills in. `{monster|을}` picks 을 or 를 for the filled word. */
export const SLOTS = [
  "player",
  "monster",
  "count",
  "place",
  "item",
  "npc",
  "quest",
  "thesis",
  "award",
  /** A club's name. */
  "club",
  /** A moment the client formats: "18:30", "12월 3일 18시". */
  "time",
  /** The target of a count, beside `count`. */
  "total",
  /** An amount of 솔방울, already formatted. */
  "price",
  /** A moderation reason written by an operator. */
  "reason",
  "level",
  /** Several player names, joined by the client. */
  "names",
] as const;
export type Slot = (typeof SLOTS)[number];

export interface QuestTemplate {
  readonly id: string;
  readonly kind: "hunt" | "collect" | "escort" | "nohit" | "deliver" | "help";
  readonly cadence: "daily" | "weekly" | "repeat" | "help";
  /** Who pinned the notice. */
  readonly poster: TextKey;
  /** Set when a character wrote the notice by hand, so its register is checked. */
  readonly voice?: string;
  /** First milestone the template can be drawn at. */
  readonly from?: Milestone;
  readonly title: TextKey;
  readonly body: TextKey;
  readonly slots: readonly Slot[];
}

export interface SystemMessage {
  readonly id: string;
  /** Who delivers it. Server announcements use the principal or the school broadcast. */
  readonly voice: string;
  readonly channel: "system" | "toast" | "dialogue";
  readonly text: TextKey;
  readonly slots: readonly Slot[];
}

/**
 * A notice no board draw picks: the 청소 당번 daily, posted by its own system. Same text rules as a
 * quest template.
 */
export interface ChoreNotice {
  readonly id: string;
  readonly poster: TextKey;
  readonly voice?: string;
  readonly title: TextKey;
  readonly body: TextKey;
  readonly slots: readonly Slot[];
}

/** A joke award (PLAN §11), printed as a 상장 from the principal. */
export interface Award {
  readonly id: string;
  readonly title: TextKey;
  readonly citation: TextKey;
  /** Writer-facing: what earns it. */
  readonly when: string;
}

export interface EasterEgg {
  readonly id: string;
  /** Map, prop or speaker that carries it. */
  readonly where: string;
  readonly texts: readonly TextKey[];
  /** Writer-facing: the school-life detail it nods to, with no real names. */
  readonly nod: string;
}

/** One module's share of the live-world copy, merged into the bundle by `index.ts`. */
export interface CopyPart {
  readonly system?: readonly SystemMessage[];
  readonly announcements?: readonly SystemMessage[];
  readonly descriptions?: readonly Description[];
  readonly terms?: readonly Term[];
  readonly chores?: readonly ChoreNotice[];
  readonly ko: Strings;
}

/** Everything the narrative lane ships, with its locale. */
export interface Narrative {
  readonly speakers: readonly Speaker[];
  readonly opening: readonly OpeningBeat[];
  readonly cutscenes: readonly Cutscene[];
  readonly story: readonly StoryBeat[];
  readonly bosses: readonly BossScript[];
  readonly codex: readonly CodexEntry[];
  readonly barks: readonly Bark[];
  readonly descriptions: readonly Description[];
  /** Names the combat and progression data shows. Optional so older bundles stay valid. */
  readonly terms?: readonly Term[];
  readonly quests: readonly QuestTemplate[];
  readonly chores?: readonly ChoreNotice[];
  readonly system: readonly SystemMessage[];
  readonly announcements: readonly SystemMessage[];
  readonly awards: readonly Award[];
  /** Fixed strings around every award: the heading and the signature line. */
  readonly awardFrame: { readonly heading: TextKey; readonly signature: TextKey };
  readonly eggs: readonly EasterEgg[];
  readonly ko: Strings;
}
