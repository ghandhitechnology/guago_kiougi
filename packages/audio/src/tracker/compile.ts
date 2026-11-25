/** Checks a song source and turns its phrase text into rows once, before it plays. */

import type { ChannelSource, Instrument, SongSource } from "./format.ts";
import { ParseError, type Phrase, parsePhrase, phraseRef } from "./parse.ts";

export interface CompiledChannel {
  readonly source: ChannelSource;
  readonly instrument: Instrument;
  readonly stem: number;
}

export interface CompiledFrame {
  readonly rows: number;
  /** Per channel: the phrase, or null when the channel is not named in this frame. */
  readonly phrases: readonly (Phrase | null)[];
  readonly names: readonly (string | null)[];
  readonly transpose: readonly number[];
}

export interface CompiledSong {
  readonly id: string;
  readonly source: SongSource;
  readonly rowsPerBar: number;
  readonly stems: readonly string[];
  readonly channels: readonly CompiledChannel[];
  readonly frames: readonly CompiledFrame[];
}

export function compileSong(id: string, source: SongSource): CompiledSong {
  const rowsPerBar = source.rowsPerBeat * source.beatsPerBar;
  const stems: string[] = [];
  const names = new Set<string>();
  const channels = source.channels.map((c) => {
    if (names.has(c.name)) throw new ParseError(`${id}: channel "${c.name}" twice`);
    names.add(c.name);
    const instrument = source.instruments[c.instrument];
    if (!instrument)
      throw new ParseError(`${id}: channel "${c.name}" uses unknown instrument "${c.instrument}"`);
    if (!stems.includes(c.stem)) stems.push(c.stem);
    return { source: c, instrument, stem: stems.indexOf(c.stem) };
  });

  const parsed = new Map<string, Phrase>();
  for (const [name, text] of Object.entries(source.phrases))
    parsed.set(name, parsePhrase(text, rowsPerBar, `${id} phrase "${name}"`));

  const frames = source.order.map((frame, f) => {
    for (const key of Object.keys(frame))
      if (!names.has(key)) throw new ParseError(`${id} frame ${f}: unknown channel "${key}"`);
    let rows = -1;
    const phrases: (Phrase | null)[] = [];
    const refs: (string | null)[] = [];
    const transpose: number[] = [];
    for (const c of channels) {
      const ref = frame[c.source.name];
      if (ref === undefined) {
        phrases.push(null);
        refs.push(null);
        transpose.push(0);
        continue;
      }
      const { name, transpose: shift } = phraseRef(ref);
      const phrase = parsed.get(name);
      if (!phrase) throw new ParseError(`${id} frame ${f}: unknown phrase "${name}"`);
      if (rows === -1) rows = phrase.length;
      else if (phrase.length !== rows)
        throw new ParseError(
          `${id} frame ${f}: phrase "${name}" has ${phrase.length} rows, the frame has ${rows}`,
        );
      const kit = c.instrument.kind === "kit";
      for (const cell of phrase) {
        if (cell?.kind === "note" && kit)
          throw new ParseError(`${id} phrase "${name}": notes on kit channel "${c.source.name}"`);
        if (cell?.kind === "drum" && !kit)
          throw new ParseError(`${id} phrase "${name}": drums on channel "${c.source.name}"`);
      }
      phrases.push(phrase);
      refs.push(name);
      transpose.push(shift);
    }
    if (rows <= 0) throw new ParseError(`${id} frame ${f}: no phrases`);
    return { rows, phrases, names: refs, transpose };
  });
  if (frames.length === 0) throw new ParseError(`${id}: empty order`);
  if (source.loop !== false && (source.loop < 0 || source.loop >= frames.length))
    throw new ParseError(`${id}: loop frame ${source.loop} out of range`);
  return { id, source, rowsPerBar, stems, channels, frames };
}
