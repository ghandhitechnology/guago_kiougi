/** The audio lab page. A tool, not game UI: names only, no decoration. */

import { BEDS, EFFECTS, SONGS } from "../content/index.ts";
import {
  AMBIENT_IDS,
  type AmbientId,
  audio,
  BUSES,
  type Bus,
  EFFECT_IDS,
  type EffectId,
  SONG_IDS,
  type SongId,
} from "../index.ts";
import { type CompiledSong, compileSong } from "../tracker/compile.ts";
import { type Cell, noteName } from "../tracker/parse.ts";
import { songShape } from "../tracker/schedule.ts";

audio.unlock();

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { cls?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { cls, ...rest } = props;
  Object.assign(node, rest);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}

function button(label: string, onclick: () => void): HTMLButtonElement {
  return el("button", { onclick, textContent: label });
}

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`guago-audio-lab:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(`guago-audio-lab:${key}`, value);
    } catch {
      // Private mode: volumes just are not remembered.
    }
  },
};

const compiled = new Map<SongId, CompiledSong>();
const song = (id: SongId) => {
  let c = compiled.get(id);
  if (!c) {
    c = compileSong(id, SONGS[id]);
    compiled.set(id, c);
  }
  return c;
};

// Music.
let fade = 1.5;
let playing: SongId | null = null;
const stemRow = el("div", { cls: "row" });
const songButtons = new Map<SongId, HTMLButtonElement>();
const musicSection = el("section", {}, el("h2", { textContent: "음악" }));
for (const id of SONG_IDS) {
  const s = SONGS[id];
  const c = song(id);
  const shape = songShape(
    c.frames.map((f) => f.rows),
    s.loop,
  );
  const seconds = ((shape.intro + shape.loop) * 60) / (s.bpm * s.rowsPerBeat);
  const play = button("▶", () => {
    audio.music(id, { fade });
    playing = id;
    refreshMusic();
  });
  songButtons.set(id, play);
  musicSection.append(
    el(
      "div",
      { cls: "song" },
      play,
      button("■", () => {
        if (playing === id) {
          audio.music(null, { fade });
          playing = null;
          refreshMusic();
        }
      }),
      el(
        "span",
        {},
        `${s.title} `,
        el("span", {
          cls: "dim",
          textContent: `${id} · ${s.key} · ${s.bpm} BPM · ${seconds.toFixed(0)} s${s.loop === false ? "" : " loop"}`,
        }),
      ),
    ),
  );
}
const fadeRow = el("div", { cls: "row" }, el("span", { cls: "dim", textContent: "fade" }));
const fadeButtons = [0.05, 1.5, 4].map((f) => {
  const b = button(`${f}s`, () => {
    fade = f;
    for (const x of fadeButtons) x.classList.toggle("on", x === b);
  });
  b.classList.toggle("on", f === fade);
  fadeRow.append(b);
  return b;
});
musicSection.append(fadeRow, stemRow);

const stemLevels = new Map<string, number>();
function refreshMusic(): void {
  for (const [id, b] of songButtons) b.classList.toggle("on", id === playing);
  stemRow.replaceChildren();
  if (!playing) return;
  stemRow.append(el("span", { cls: "dim", textContent: "stems" }));
  for (const name of song(playing).stems) {
    const b = button(name, () => {
      const level = (stemLevels.get(name) ?? 1) > 0 ? 0 : 1;
      stemLevels.set(name, level);
      audio.stem(name, level, 1);
      b.classList.toggle("on", level > 0);
    });
    stemLevels.set(name, 1);
    b.classList.add("on");
    stemRow.append(b);
  }
}

// Pattern.
const where = el("div", { cls: "row dim" });
const pattern = el("div", { id: "pattern" });
const patternSection = el("section", {}, el("h2", { textContent: "패턴" }), where, pattern);
let shownKey = "";
let table: HTMLTableElement | null = null;

function cellText(cell: Cell | null | undefined): string {
  if (!cell) return "·";
  let head: string;
  switch (cell.kind) {
    case "note":
      head = (cell.notes ?? []).map(noteName).join(",");
      break;
    case "drum":
      head = (cell.drums ?? []).join(",");
      break;
    case "off":
      head = "===";
      break;
    case "cut":
      head = "^^^";
      break;
    default:
      head = "...";
  }
  const vol = cell.vol === undefined ? "" : ` v${Math.round(cell.vol * 15).toString(16)}`;
  const fx = cell.fx.map((f) => ` ${f.code}${f.value.toString(16).padStart(2, "0")}`).join("");
  return `${head}${vol}${fx}`;
}

function showFrame(id: SongId, frame: number): void {
  const c = song(id);
  const f = c.frames[frame];
  if (!f) return;
  const header = el(
    "tr",
    {},
    el("th", { textContent: "" }),
    ...c.channels.map((ch) => el("th", { textContent: ch.source.name })),
  );
  const rows: HTMLTableRowElement[] = [];
  for (let r = 0; r < f.rows; r++) {
    const tr = el(
      "tr",
      { cls: r % c.rowsPerBar === 0 ? "bar" : "" },
      el("td", { cls: "n", textContent: r.toString(16).padStart(2, "0") }),
      ...c.channels.map((_, i) =>
        el("td", { textContent: f.phrases[i] ? cellText(f.phrases[i]?.[r]) : "" }),
      ),
    );
    rows.push(tr);
  }
  table = el("table", {}, el("thead", {}, header), el("tbody", {}, ...rows));
  pattern.replaceChildren(table);
}

let lastRow = -1;
function tickPattern(): void {
  const p = audio.debug.position();
  if (!p) {
    where.textContent = "";
    return;
  }
  const id = p.id as SongId;
  const key = `${id}:${p.frame}`;
  if (key !== shownKey) {
    shownKey = key;
    lastRow = -1;
    showFrame(id, p.frame);
  }
  const c = song(id);
  const sections = SONGS[id].sections ?? {};
  let section = "";
  for (const [k, v] of Object.entries(sections)) if (Number(k) <= p.frame) section = v;
  let bar = 1;
  for (let f = 0; f < p.frame; f++) bar += (c.frames[f]?.rows ?? 0) / c.rowsPerBar;
  bar += Math.floor(p.row / c.rowsPerBar);
  where.textContent = `${SONGS[id].title} · ${section} · bar ${bar} · row ${p.row.toString(16).padStart(2, "0")}`;
  if (!table || p.row === lastRow) return;
  const body = table.tBodies[0];
  body?.rows[lastRow]?.classList.remove("now");
  body?.rows[p.row]?.classList.add("now");
  lastRow = p.row;
  table.style.top = `${Math.round(pattern.clientHeight / 2 - (p.row + 1.5) * 16)}px`;
}

// Mixer.
const mixer = el("section", {}, el("h2", { textContent: "믹서" }));
for (const bus of BUSES) {
  const saved = store.get(bus);
  if (saved !== null) audio.setVolume(bus, Number(saved));
  const value = el("span", { textContent: audio.volume(bus).toFixed(2) });
  const input = el("input", {
    type: "range",
    min: "0",
    max: "1",
    step: "0.01",
    value: String(audio.volume(bus)),
    oninput: () => {
      audio.setVolume(bus as Bus, Number(input.value));
      value.textContent = Number(input.value).toFixed(2);
      store.set(bus, input.value);
    },
  });
  mixer.append(el("label", { cls: "slider" }, el("span", { textContent: bus }), input, value));
}
const meter = el("canvas", { width: 336, height: 24 });
meter.style.width = "336px";
meter.style.height = "24px";
const stats = el("pre");
mixer.append(meter, el("div", { cls: "row" }), stats);

const css = getComputedStyle(document.documentElement);
const color = (name: string) => css.getPropertyValue(name).trim();
const timeData = new Float32Array(2048);
let peakHold = 0;
let lastStats = { at: performance.now(), workerMs: 0 };
let load = 0;
function tickMeter(): void {
  const a = audio.debug.analyser();
  a.getFloatTimeDomainData(timeData);
  let peak = 0;
  let sum = 0;
  for (const x of timeData) {
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
  }
  const rms = Math.sqrt(sum / timeData.length);
  peakHold = Math.max(peak, peakHold * 0.97);
  const g = meter.getContext("2d") as CanvasRenderingContext2D;
  const w = meter.width;
  const toX = (v: number) => Math.max(0, Math.min(w, ((20 * Math.log10(v + 1e-9) + 48) / 48) * w));
  g.fillStyle = color("--bg");
  g.fillRect(0, 0, w, 24);
  g.fillStyle = color("--line");
  for (let db = -48; db <= 0; db += 6) g.fillRect(Math.round(((db + 48) / 48) * w) - 1, 20, 2, 4);
  g.fillStyle = color("--meter");
  g.fillRect(0, 2, Math.round(toX(rms)), 8);
  g.fillStyle = peakHold > 0.9 ? color("--hot") : color("--text");
  g.fillRect(0, 12, Math.round(toX(peakHold)), 6);
  const s = audio.debug.stats();
  const now = performance.now();
  if (now - lastStats.at > 1000) {
    load = (s.workerMs - lastStats.workerMs) / (now - lastStats.at);
    lastStats = { at: now, workerMs: s.workerMs };
  }
  stats.textContent = [
    `${s.state} · ${s.sampleRate} Hz`,
    `voices ${s.voices}/8 · stolen ${s.stolen} · dropped ${s.dropped}`,
    `duck ${(20 * Math.log10(s.duck)).toFixed(1)} dB`,
    `blocks ${s.blocks} · late ${s.late} · worker ${(load * 100).toFixed(1)}%`,
    `effects ready ${s.effectsReady}/${EFFECT_IDS.length}`,
  ].join("\n");
}

// Effects.
let pan = 0;
let pitch = 0;
const fx = el("section", {}, el("h2", { textContent: "효과음" }));
const panValue = el("span", { textContent: "0" });
const panInput = el("input", {
  type: "range",
  min: "-1",
  max: "1",
  step: "0.1",
  value: "0",
  oninput: () => {
    pan = Number(panInput.value);
    panValue.textContent = pan.toFixed(1);
  },
});
const pitchValue = el("span", { textContent: "0" });
const pitchInput = el("input", {
  type: "range",
  min: "-12",
  max: "12",
  step: "1",
  value: "0",
  oninput: () => {
    pitch = Number(pitchInput.value);
    pitchValue.textContent = String(pitch);
  },
});
fx.append(
  el("label", { cls: "slider" }, el("span", { textContent: "pan" }), panInput, panValue),
  el("label", { cls: "slider" }, el("span", { textContent: "pitch" }), pitchInput, pitchValue),
);
const loops = new Map<EffectId, { stop(): void }>();
const groups = new Map<string, HTMLDivElement>();
for (const id of EFFECT_IDS) {
  const group = id.split(".")[0] as string;
  let grid = groups.get(group);
  if (!grid) {
    grid = el("div", { cls: "grid" });
    groups.set(group, grid);
    fx.append(el("div", { cls: "group" }, el("div", { textContent: group }), grid));
  }
  const looping = (EFFECTS[id] as { loop?: number }).loop !== undefined;
  const b = button(id.slice(group.length + 1), () => {
    if (looping) {
      const on = loops.get(id);
      if (on) {
        on.stop();
        loops.delete(id);
        b.classList.remove("on");
        return;
      }
      const s = audio.play(id, { pan, pitch });
      if (s) {
        loops.set(id, s);
        b.classList.add("on");
      }
      return;
    }
    audio.play(id, { pan, pitch });
  });
  grid.append(b);
}
fx.append(
  el(
    "div",
    { cls: "row" },
    button("burst", () => {
      const pool = EFFECT_IDS.filter(
        (id) => (EFFECTS[id] as { loop?: number }).loop === undefined && id !== "sagam.whistle",
      );
      for (let i = 0; i < 24; i++)
        setTimeout(() => {
          audio.play(pool[Math.floor(Math.random() * pool.length)] as EffectId, {
            pan: Math.random() * 2 - 1,
          });
        }, i * 25);
    }),
  ),
);

// Ambient.
let bed: AmbientId | null = null;
const bedButtons = new Map<AmbientId, HTMLButtonElement>();
const ambient = el("section", {}, el("h2", { textContent: "환경음" }));
const bedRow = el("div", { cls: "grid" });
for (const id of AMBIENT_IDS) {
  const b = button(`${BEDS[id].title}`, () => {
    bed = bed === id ? null : id;
    audio.ambient(bed);
    for (const [k, x] of bedButtons) x.classList.toggle("on", k === bed);
  });
  b.title = id;
  bedButtons.set(id, b);
  bedRow.append(b);
}
ambient.append(bedRow);

document.body.append(
  el("h1", { textContent: "과고키우기 audio" }),
  el("main", {}, el("div", {}, musicSection, patternSection), el("div", {}, mixer, fx, ambient)),
);

function frame(): void {
  tickPattern();
  tickMeter();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
