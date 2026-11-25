/** The audio lab page. A tool, not game UI: names only, no decoration. */

import { BOOK_TABLE } from "../content/effects/books.ts";
import { BEDS, EFFECTS, JINGLES, SONGS } from "../content/index.ts";
import {
  AMBIENT_IDS,
  type AmbientId,
  audio,
  BUSES,
  type Bus,
  SONG_IDS,
  type SongId,
} from "../index.ts";
import { type CompiledSong, compileSong } from "../tracker/compile.ts";
import { type Cell, flatKey, noteName } from "../tracker/parse.ts";
import { songShape } from "../tracker/schedule.ts";
import { Horde } from "./horde.ts";

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
  const parts = Object.keys(SONGS[playing].parts ?? {});
  if (parts.length) {
    stemRow.append(el("span", { cls: "dim", textContent: "parts" }));
    for (const name of parts) stemRow.append(button(name, () => audio.part(name)));
  }
}

// Pattern.
const where = el("div", { cls: "row dim" });
const pattern = el("div", { id: "pattern" });
const patternSection = el("section", {}, el("h2", { textContent: "패턴" }), where, pattern);
let shownKey = "";
let table: HTMLTableElement | null = null;

/** One cell as text, with the frame's transposition applied to its notes. */
function cellText(cell: Cell | null | undefined, flats: boolean, shift = 0): string {
  if (!cell) return "·";
  let head: string;
  switch (cell.kind) {
    case "note":
      head = (cell.notes ?? []).map((n) => noteName(n + shift, flats)).join(",");
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
  const flats = flatKey(SONGS[id].key);
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
        el("td", {
          textContent: f.phrases[i] ? cellText(f.phrases[i]?.[r], flats, f.transpose[i] ?? 0) : "",
        }),
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
    `sounds ready ${s.ready}/${s.sounds} · ${(s.bufferBytes / 1048576).toFixed(1)} MB`,
    `hits ${s.hits.events} · heard ${s.hits.played} · merged ${s.hits.merged} · limited ${s.hits.limited} · culled ${s.hits.culled}`,
  ].join("\n");
  if (horde)
    hordeStats.textContent = `events ${(horde.stats.events / Math.max(1, horde.stats.seconds)).toFixed(0)}/s · calls ${(horde.stats.callMs / Math.max(1, horde.stats.seconds)).toFixed(1)} ms/s`;
}

// Effects: every sound the library has, grouped by its id.
let pan = 0;
let pitch = 0;
const fx = el("section", {}, el("h2", { textContent: "효과음" }));
const slider = (name: string, min: number, max: number, step: number, set: (v: number) => void) => {
  const value = el("span", { textContent: "0" });
  const input = el("input", {
    type: "range",
    min: String(min),
    max: String(max),
    step: String(step),
    value: "0",
    oninput: () => {
      set(Number(input.value));
      value.textContent = input.value;
    },
  });
  return el("label", { cls: "slider" }, el("span", { textContent: name }), input, value);
};
fx.append(
  slider("pan", -1, 1, 0.1, (v) => {
    pan = v;
  }),
  slider("pitch", -12, 12, 1, (v) => {
    pitch = v;
  }),
);
const groupOf = (id: string) => {
  const parts = id.split(".");
  return parts[0] === "sfx" ? `${parts[0]}.${parts[1]}` : (parts[0] as string);
};
const loops = new Map<string, { stop(): void }>();
const groups = new Map<string, HTMLDivElement>();
for (const id of [...Object.keys(EFFECTS), ...Object.keys(JINGLES)]) {
  const group = groupOf(id);
  let grid = groups.get(group);
  if (!grid) {
    grid = el("div", { cls: "grid" });
    groups.set(group, grid);
    fx.append(el("div", { cls: "group" }, el("div", { textContent: group }), grid));
  }
  const looping = (EFFECTS[id] as { loop?: number } | undefined)?.loop !== undefined;
  const b = button(id.slice(group.length + 1), () => {
    if (looping) {
      const on = loops.get(id);
      if (on) {
        on.stop();
        loops.delete(id);
        b.classList.remove("on");
        return;
      }
      const s = audio.cue(id, { pan, pitch });
      if (s) {
        loops.set(id, s);
        b.classList.add("on");
      }
      return;
    }
    audio.cue(id, { pan, pitch });
  });
  b.title = id;
  grid.append(b);
}
fx.append(
  el(
    "div",
    { cls: "row" },
    button("preload page1", () => audio.preload("page1")),
  ),
);

// Combat: the hit system, class signatures and the horde.
let own = true;
let distance = 0;
let proofStack = 0;
const combat = el("section", {}, el("h2", { textContent: "전투" }));
const ownButton = button("own", () => {
  own = !own;
  ownButton.textContent = own ? "own" : "other";
  ownButton.classList.toggle("on", own);
});
ownButton.classList.add("on");
combat.append(
  el("div", { cls: "row" }, ownButton),
  slider("distance", 0, 400, 10, (v) => {
    distance = v;
  }),
);
for (const cls of ["math", "physics", "chemistry", "biology", "earth"] as const) {
  const book = BOOK_TABLE.find((b) => b.cls === cls);
  const hit = (o: { heavy?: boolean; crit?: boolean; kill?: boolean }) =>
    audio.hit({
      cls,
      own,
      dx: distance * (pan < 0 ? -1 : 1),
      ...o,
      ...(book ? { impact: `sfx.book.${book.id}.${book.hit}` } : {}),
      material: "sfx.monster.odap.hit",
      death: "sfx.monster.odap.die",
    });
  combat.append(
    el(
      "div",
      { cls: "row" },
      el("span", { cls: "dim", textContent: cls }),
      button("light", () => hit({})),
      button("heavy", () => hit({ heavy: true })),
      button("crit", () => hit({ crit: true })),
      button("kill", () => hit({ kill: true })),
      button("×12", () => {
        for (let i = 0; i < 12; i++) setTimeout(() => hit({}), i * 15);
      }),
    ),
  );
}
const proofButton = button("증명 1", () => {
  proofStack = (proofStack % 10) + 1;
  audio.proof(proofStack);
  proofButton.textContent = `증명 ${(proofStack % 10) + 1}`;
});
combat.append(
  el(
    "div",
    { cls: "row" },
    proofButton,
    button("충돌 1", () => audio.collide(1)),
    button("충돌 2", () => audio.collide(2)),
    button("충돌 3", () => audio.collide(3)),
    button("예보 1.2s", () => audio.forecast({ delay: 1.2 })),
    button("예보 0.8s", () => audio.forecast({ delay: 0.8 })),
  ),
);
let horde: Horde | null = null;
const hordeStats = el("pre");
const hordeButton = button("horde: 150 monsters, 5 players", () => {
  if (horde?.running) {
    horde.stop();
    hordeButton.classList.remove("on");
    return;
  }
  audio.music("agora", { fade: 1 });
  audio.ambient("campus-afternoon");
  horde = new Horde(audio, { players: 5, ownClass: "math", surge: 20, lull: 6 });
  horde.start();
  hordeButton.classList.add("on");
});
combat.append(el("div", { cls: "row" }, hordeButton), hordeStats);

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
  el(
    "main",
    {},
    el("div", {}, musicSection, patternSection, combat),
    el("div", {}, mixer, ambient, fx),
  ),
);

function frame(): void {
  tickPattern();
  tickMeter();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
