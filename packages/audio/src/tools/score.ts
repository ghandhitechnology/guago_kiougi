/**
 * `pnpm audio:score` reads every song as a score, without sound: form and length, the range and
 * rest share of each channel, and every place two voices sit a minor second or minor ninth apart
 * for a beat or longer, which is where a wrong note usually hides.
 */

import { SONGS } from "../content/index.ts";
import { type CompiledSong, compileSong } from "../tracker/compile.ts";
import { noteName } from "../tracker/parse.ts";
import { songShape } from "../tracker/schedule.ts";

interface Sounding {
  /** Per absolute row: the notes each channel is sounding. */
  rows: (number[] | null)[][];
  /** Per absolute row: frame and row inside it. */
  where: { frame: number; row: number }[];
}

/** Which notes each channel holds on each row, following note, release and cut. */
export function sounding(song: CompiledSong): Sounding {
  const rows: (number[] | null)[][] = song.channels.map(() => []);
  const where: { frame: number; row: number }[] = [];
  const held: (number[] | null)[] = song.channels.map(() => null);
  const since: number[] = song.channels.map(() => 0);
  song.frames.forEach((frame, f) => {
    for (let r = 0; r < frame.rows; r++) {
      where.push({ frame: f, row: r });
      song.channels.forEach((c, i) => {
        const cell = frame.phrases[i]?.[r];
        if (cell?.kind === "note") {
          held[i] = (cell.notes ?? []).map((n) => n + (frame.transpose[i] ?? 0));
          since[i] = 0;
        } else if (cell?.kind === "off" || cell?.kind === "cut") held[i] = null;
        // Plucked and struck sounds fade: count them for a beat after the strike.
        const inst = c.instrument;
        const fades = inst.kind === "pluck" || (inst.kind === "fm" && (inst.env.s ?? 0) < 0.1);
        const value = fades && (since[i] as number) >= 4 ? null : held[i];
        const unpitched =
          inst.kind === "kit" || (inst.kind === "osc" && inst.osc.every((o) => o.wave === "noise"));
        (rows[i] as (number[] | null)[]).push(unpitched ? null : (value ?? null));
        since[i] = (since[i] as number) + 1;
      });
    }
  });
  return { rows, where };
}

/**
 * Notes still held when a frame ends and the next frame (or the loop) does not name the channel:
 * they would sound through the whole next section.
 */
export function hanging(song: CompiledSong): string[] {
  const out: string[] = [];
  const held: (number[] | null)[] = song.channels.map(() => null);
  const order = song.frames.map((_, f) => f);
  if (song.source.loop !== false)
    for (let f = song.source.loop; f < song.frames.length; f++) order.push(f);
  order.forEach((f, step) => {
    const frame = song.frames[f];
    if (!frame) return;
    song.channels.forEach((c, i) => {
      const phrase = frame.phrases[i];
      if (!phrase) {
        const h = held[i];
        const sustains =
          c.instrument.kind === "osc" || (c.instrument.kind === "fm" && c.instrument.env.s > 0);
        if (h && sustains && step > 0)
          out.push(`frame ${f}: ${c.source.name} still holds ${h.map(noteName).join(",")}`);
        return;
      }
      for (const cell of phrase) {
        if (cell?.kind === "note")
          held[i] = (cell.notes ?? []).map((n) => n + (frame.transpose[i] ?? 0));
        else if (cell?.kind === "off" || cell?.kind === "cut") held[i] = null;
      }
    });
  });
  return [...new Set(out)];
}

export interface Clash {
  bar: number;
  row: number;
  section: string;
  a: string;
  b: string;
  notes: string;
  rows: number;
}

export function clashes(song: CompiledSong, minRows = 2): Clash[] {
  const { rows, where } = sounding(song);
  const out: Clash[] = [];
  const names = song.channels.map((c) => c.source.name);
  const total = where.length;
  const open = new Map<string, { start: number; notes: string }>();
  const sectionOf = (frame: number) => {
    let name = "";
    for (const [k, v] of Object.entries(song.source.sections ?? {}))
      if (Number(k) <= frame) name = v;
    return name;
  };
  const flush = (key: string, end: number) => {
    const o = open.get(key);
    if (!o) return;
    open.delete(key);
    if (end - o.start < minRows) return;
    const [a, b] = key.split("/");
    const w = where[o.start] as { frame: number; row: number };
    let bar = 0;
    for (let f = 0; f < w.frame; f++) bar += (song.frames[f]?.rows ?? 0) / song.rowsPerBar;
    out.push({
      bar: bar + Math.floor(w.row / song.rowsPerBar) + 1,
      row: w.row % song.rowsPerBar,
      section: sectionOf(w.frame),
      a: a as string,
      b: b as string,
      notes: o.notes,
      rows: end - o.start,
    });
  };
  for (let t = 0; t < total; t++) {
    const now = new Set<string>();
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const x = rows[i]?.[t];
        const y = rows[j]?.[t];
        if (!x || !y) continue;
        for (const p of x)
          for (const q of y) {
            const d = Math.abs(p - q);
            if (d === 1 || d === 13 || d === 25) {
              const key = `${names[i]}/${names[j]}`;
              now.add(key);
              if (!open.has(key))
                open.set(key, { start: t, notes: `${noteName(p)}–${noteName(q)}` });
            }
          }
      }
    for (const key of [...open.keys()]) if (!now.has(key)) flush(key, t);
  }
  for (const key of [...open.keys()]) flush(key, total);
  return out;
}

function summary(id: string, song: CompiledSong): string {
  const s = song.source;
  const rowSec = 60 / (s.bpm * s.rowsPerBeat);
  const shape = songShape(
    song.frames.map((f) => f.rows),
    s.loop,
  );
  const lines = [
    `## ${id}: ${s.title}`,
    `${s.key}, ${s.bpm} BPM, ${s.beatsPerBar}/4, ${(shape.intro + shape.loop) / song.rowsPerBar} bars, ` +
      `${((shape.intro + shape.loop) * rowSec).toFixed(1)} s` +
      (s.loop === false
        ? " (plays once)"
        : `, loop ${(shape.loop * rowSec).toFixed(1)} s from frame ${s.loop}`),
    "",
    "| Channel | Range | Notes | Resting |",
    "|---|---|---|---|",
  ];
  const { rows } = sounding(song);
  song.channels.forEach((c, i) => {
    if (c.instrument.kind === "kit") return;
    const all = (rows[i] ?? []).flatMap((r) => r ?? []);
    if (all.length === 0) return;
    let notes = 0;
    for (const f of song.frames)
      for (const cell of f.phrases[i] ?? []) if (cell?.kind === "note") notes++;
    const resting = (rows[i] ?? []).filter((r) => !r).length / (rows[i]?.length || 1);
    lines.push(
      `| ${c.source.name} | ${noteName(Math.min(...all))}–${noteName(Math.max(...all))} | ${notes} | ${(resting * 100).toFixed(0)}% |`,
    );
  });
  for (const h of hanging(song)) lines.push("", `Hanging note: ${h}`);
  const found = clashes(song);
  lines.push(
    "",
    found.length ? "Minor-second clashes of an eighth note or longer:" : "No minor-second clashes.",
  );
  for (const c of found)
    lines.push(
      `- bar ${c.bar} row ${c.row} (${c.section}): ${c.a} and ${c.b}, ${c.notes}, ${c.rows} rows`,
    );
  return lines.join("\n");
}

if (import.meta.main) {
  const ids = process.argv.slice(2);
  for (const [id, source] of Object.entries(SONGS)) {
    if (ids.length && !ids.includes(id)) continue;
    console.log(`${summary(id, compileSong(id, source))}\n`);
  }
}
