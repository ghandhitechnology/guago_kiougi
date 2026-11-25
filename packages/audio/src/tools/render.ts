/**
 * `pnpm audio:render <dir>` renders every song, effect and ambient bed to 16-bit WAV files and
 * writes `measurements.md` beside them.
 *
 * It runs the same synth code the browser's audio worker runs, offline in Node, so a file is
 * what the game plays before the mixer (bus volumes, ducking and the master limiter).
 *
 * Songs render through their loop and eight seconds past the loop point, so the seam can be
 * heard. Options: `--only hub,ui.stamp`, `--rate 44100`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { BedPlayer } from "../ambient/bed.ts";
import { BEDS, EFFECTS, JINGLES, SONGS } from "../content/index.ts";
import { CATEGORY_TARGET } from "../sfx/format.ts";
import { renderEffect, shortLoudness } from "../sfx/render.ts";
import { compileSong } from "../tracker/compile.ts";
import { renderJingle } from "../tracker/jingle.ts";
import { SongPlayer } from "../tracker/player.ts";
import { rowStart, songShape, timing } from "../tracker/schedule.ts";
import { BAND_NAMES, type Measurement, measure, seam } from "./measure.ts";
import { wav } from "./wav.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: "string" },
    rate: { type: "string", default: "48000" },
    mix: { type: "boolean", default: false },
  },
});
const dir = resolve(process.env.INIT_CWD ?? process.cwd(), positionals[0] ?? "audio-render");
const sr = Number(values.rate);
const only = values.only ? new Set(values.only.split(",")) : null;
mkdirSync(dir, { recursive: true });

interface Row {
  file: string;
  kind: string;
  m: Measurement;
  extra: string;
}
const rows: Row[] = [];
const mixes: string[] = [];

function save(name: string, channels: Float32Array[], kind: string, extra = ""): Measurement {
  const file = `${name}.wav`;
  writeFileSync(`${dir}/${file}`, wav(channels, sr));
  const m = measure(channels, sr);
  rows.push({ file, kind, m, extra });
  console.log(
    `${file}  ${m.seconds.toFixed(1)} s  peak ${m.peak.toFixed(1)}  ${m.lufs.toFixed(1)} LUFS ${extra}`,
  );
  return m;
}

/** Renders a song into stereo, mixing its stems. `solo` keeps one channel. */
export function renderSong(id: string, seconds: number, rate: number, solo?: string) {
  const base = SONGS[id as keyof typeof SONGS];
  const source = solo
    ? { ...base, channels: base.channels.map((c) => (c.name === solo ? c : { ...c, volume: 0 })) }
    : base;
  const song = compileSong(id, source);
  const n = Math.ceil(seconds * rate);
  const out = Array.from({ length: song.stems.length * 2 }, () => new Float32Array(n));
  const player = new SongPlayer(song, rate);
  const t0 = performance.now();
  const block = 4096;
  for (let i = 0; i < n; i += block) {
    player.render(out, i, Math.min(block, n - i));
    if (player.finished) break;
  }
  const ms = performance.now() - t0;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let s = 0; s < song.stems.length; s++)
    for (let i = 0; i < n; i++) {
      L[i] = (L[i] as number) + (out[s * 2]?.[i] as number);
      R[i] = (R[i] as number) + (out[s * 2 + 1]?.[i] as number);
    }
  return { song, L, R, ms };
}

for (const id of Object.keys(SONGS)) {
  if (only && !only.has(id)) continue;
  const source = SONGS[id as keyof typeof SONGS];
  const compiled = compileSong(id, source);
  const shape = songShape(
    compiled.frames.map((f) => f.rows),
    source.loop,
  );
  const t = timing(sr, source.bpm, source.rowsPerBeat, source.swing ?? 0, source.speed ?? 6);
  const loopAt = rowStart(t, shape.intro + shape.loop) / sr;
  const firstPass = rowStart(t, shape.intro) / sr;
  const seconds = source.loop === false ? loopAt + 3 : loopAt + 8;
  const { L, R, ms } = renderSong(id, seconds, sr);
  let extra = `render ${(ms / 1000).toFixed(2)} s (${(seconds / (ms / 1000)).toFixed(0)}× realtime)`;
  if (source.loop !== false) {
    const atSeam = seam([L, R], sr, loopAt);
    const atStart = seam([L, R], sr, firstPass);
    const rms = (a: number, b: number) => {
      let s = 0;
      const i0 = Math.round(a * sr);
      const i1 = Math.round(b * sr);
      for (let i = i0; i < i1; i++) s += (L[i] as number) ** 2 + (R[i] as number) ** 2;
      return 10 * Math.log10(s / (2 * (i1 - i0)) + 1e-20);
    };
    extra += `; seam ${atSeam.toFixed(1)} dB vs first pass ${atStart.toFixed(1)} dB; level 2 s before/after ${rms(loopAt - 2, loopAt).toFixed(1)}/${rms(loopAt, loopAt + 2).toFixed(1)} dB; loop point ${loopAt.toFixed(2)} s`;
  }
  save(`music-${id}`, [L, R], "music", extra);
  if (values.mix) {
    const whole = measure([L, R], sr).lufs;
    const parts = source.channels.map((c) => {
      const solo = renderSong(id, seconds, sr, c.name);
      const m = measure([solo.L, solo.R], sr);
      return `${c.name} ${(m.lufs - whole).toFixed(1)}`;
    });
    mixes.push(`| ${id} | ${parts.join(", ")} |`);
  }
}

for (const [id, source] of Object.entries(EFFECTS)) {
  if (only && !only.has(id)) continue;
  const r = renderEffect(id, source, sr);
  // A loop is written three times over, so its seam sits inside the file and gets measured.
  const gap = r.loop ? 0 : Math.round(0.35 * sr);
  const takes = r.loop ? [0, 0, 0].map(() => r.variants[0] as Float32Array) : r.variants;
  const total = takes.reduce((n, v) => n + v.length + gap, 0);
  const x = new Float32Array(total);
  let o = 0;
  for (const v of takes) {
    x.set(v, o);
    o += v.length + gap;
  }
  const loops = r.loop ? `, loops ${(r.variants[0]?.length ?? 0) / sr} s` : "";
  const target = CATEGORY_TARGET[source.category] + ((source as { level?: number }).level ?? 0);
  const loud = r.variants.map((v) => shortLoudness(v, sr).toFixed(1)).join("/");
  save(
    `fx-${id}`,
    [x],
    "effect",
    `${source.category}, target ${target} dB, loudest 50 ms ${loud} dB; ${r.variants.length} variant${r.variants.length > 1 ? "s" : ""}${loops}`,
  );
}

for (const [id, j] of Object.entries(JINGLES)) {
  if (only && !only.has(id)) continue;
  const t0 = performance.now();
  const [L, R] = renderJingle(id, j.song, sr);
  const ms = performance.now() - t0;
  save(
    `${id}`,
    [L, R],
    "jingle",
    `${j.bank} bank, ducks music ${j.duck} dB; render ${ms.toFixed(0)} ms`,
  );
}

for (const [id, source] of Object.entries(BEDS)) {
  if (only && !only.has(id)) continue;
  const seconds = 40;
  const n = seconds * sr;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const bed = new BedPlayer(source, sr, 7);
  const t0 = performance.now();
  for (let i = 0; i < n; i += 4096) bed.render([L, R], i, Math.min(4096, n - i));
  const ms = performance.now() - t0;
  save(
    `ambient-${id}`,
    [L, R],
    "ambient",
    `render ${(seconds / (ms / 1000)).toFixed(0)}× realtime`,
  );
}

const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "–");
const table = [
  "| File | Kind | Length s | Peak dBFS | RMS dBFS | LUFS | Loudest 400 ms LUFS | DC | Clipped | Worst click dB | " +
    BAND_NAMES.map((b) => `${b} dB`).join(" | ") +
    " | Notes |",
  `|${"---|".repeat(11 + BAND_NAMES.length)}`,
  ...rows.map(
    (r) =>
      `| ${r.file} | ${r.kind} | ${f(r.m.seconds)} | ${f(r.m.peak)} | ${f(r.m.rms)} | ${f(r.m.lufs)} | ${f(r.m.momentaryMax)} | ${r.m.dc.toExponential(1)} | ${r.m.clipped} | ${f(r.m.click)} @ ${r.m.clickAt.toFixed(2)} s | ` +
      r.m.bands.map(f).join(" | ") +
      ` | ${r.extra} |`,
  ),
];
const mixTable = mixes.length
  ? `\n## Channel balance\n\nEach channel alone, in LU against the full mix (gated, over the whole render).\n\n| Song | Channels |\n|---|---|\n${mixes.join("\n")}\n`
  : "";
writeFileSync(
  `${dir}/measurements.md`,
  `# Audio measurements (${sr} Hz)\n\n${table.join("\n")}\n${mixTable}`,
);
writeFileSync(`${dir}/measurements.json`, JSON.stringify(rows, null, 1));
console.log(`\n${rows.length} files in ${dir}`);
