/**
 * Writing helpers. Copy is written inline where it is read in context, and each call files the
 * Korean under a key and returns the key, so the data holds keys and the locale holds text.
 * Keys are `<file>.<scope>.<n>`: scopes are named, lines inside a scope are numbered in order.
 */
import type {
  Dir,
  Doc,
  DocRow,
  Effect,
  Line,
  Music,
  Prompt,
  SoundCue,
  Step,
  TextKey,
} from "./schema.ts";

export class Writer {
  readonly ko: Record<TextKey, string> = {};
  readonly #prefix: string;

  constructor(prefix: string) {
    this.#prefix = prefix;
  }

  scope(name: string): Scope {
    return new Scope(this, name);
  }

  /** Files one string under an exact key. */
  put(key: string, text: string): TextKey {
    const full = `${this.#prefix}.${key}`;
    if (full in this.ko) throw new Error(`text key ${full} is filed twice`);
    this.ko[full] = text;
    return full;
  }
}

type Hand = NonNullable<DocRow["hand"]>;

/** Option list for `ask`: the player's words, then the lines that answer them. */
export type Options = readonly (readonly [string, readonly Line[]])[];

export class Scope {
  readonly #writer: Writer;
  readonly #name: string;
  #n = 0;

  constructor(writer: Writer, name: string) {
    this.#writer = writer;
    this.#name = name;
  }

  /** Files the next string of this scope. */
  t(text: string): TextKey {
    this.#n += 1;
    return this.#writer.put(`${this.#name}.${this.#n}`, text);
  }

  line(speaker: string, text: string, face?: string): Line {
    const key = this.t(text);
    return face ? { speaker, face, text: key } : { speaker, text: key };
  }

  say(speaker: string, text: string, face?: string): Step {
    return { do: "say", line: this.line(speaker, text, face) };
  }

  bubble(speaker: string, text: string, face?: string): Step {
    return { do: "bubble", line: this.line(speaker, text, face) };
  }

  /** A line followed by the player's choice. */
  ask(speaker: string, text: string, face: string | undefined, options: Options): Step {
    const line = this.line(speaker, text, face);
    return {
      do: "say",
      line: { ...line, choice: options.map(([words, reply]) => ({ text: this.t(words), reply })) },
    };
  }

  doc(title: string | undefined, rows: readonly (string | readonly [string, Hand])[]): Step {
    const doc: Doc = {
      ...(title === undefined ? {} : { title: this.t(title) }),
      rows: rows.map((r) =>
        typeof r === "string" ? { text: this.t(r) } : { text: this.t(r[0]), hand: r[1] },
      ),
    };
    return { do: "show", doc };
  }

  title(...lines: string[]): Step {
    return { do: "title", lines: lines.map((l) => this.t(l)) };
  }

  offer(at: string, lines: readonly Line[]): Step {
    return { do: "offer", at, lines };
  }
}

export const camera = (to: string, ms = 600): Step => ({ do: "camera", to, ms });
export const move = (actor: string, to: string, ms?: number): Step =>
  ms === undefined ? { do: "move", actor, to } : { do: "move", actor, to, ms };
export const face = (actor: string, dir: Dir): Step => ({ do: "face", actor, dir });
export const anim = (actor: string, name: string): Step => ({ do: "anim", actor, anim: name });
export const fx = (effect: Effect, at?: string): Step =>
  at === undefined ? { do: "fx", fx: effect } : { do: "fx", fx: effect, at };
export const sound = (cue: SoundCue): Step => ({ do: "sound", cue });
export const music = (track: Music | null): Step => ({ do: "music", track });
export const wait = (ms: number): Step => ({ do: "wait", ms });
export const system = (message: string): Step => ({ do: "system", message });
export const play = (until: string, prompt?: Prompt, at?: string): Step => ({
  do: "play",
  until,
  ...(prompt === undefined ? {} : { prompt }),
  ...(at === undefined ? {} : { at }),
});
