/**
 * The audio worker: renders songs and ambient beds block by block, and effects and jingles bank by
 * bank. Nothing here touches the main thread, so a phone's frame rate does not pay for synthesis.
 */

import { BedPlayer } from "../ambient/bed.ts";
import { BEDS, EFFECTS, JINGLES, SONGS } from "../content/index.ts";
import { type Bank, bankOf, type EffectSource, parseEffect } from "../sfx/format.ts";
import { renderEffect } from "../sfx/render.ts";
import { compileSong } from "../tracker/compile.ts";
import { SongPlayer } from "../tracker/player.ts";
import type { CueMeta, FromWorker, ToWorker } from "./protocol.ts";

interface Scope {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
}
const scope = self as unknown as Scope;

let sampleRate = 48000;
const decks = new Map<number, { gen: number; player: SongPlayer | BedPlayer; stems: number }>();
const pool: Float32Array[] = [];
const done = new Set<string>();
const queue: string[] = [];

function catalog(): Record<string, CueMeta> {
  const cues: Record<string, CueMeta> = {};
  for (const [id, source] of Object.entries(EFFECTS)) {
    const fx = parseEffect(id, source);
    cues[id] = {
      bank: bankOf(source),
      vary: fx.vary,
      priority: fx.priority,
      max: fx.max,
      loop: fx.loop !== undefined,
      jingle: false,
      ...(fx.duck ? { duck: fx.duck } : {}),
      ...(fx.streak ? { streak: fx.streak } : {}),
    };
  }
  for (const [id, j] of Object.entries(JINGLES)) {
    const song = compileSong(id, j.song);
    const rows = song.frames.reduce((n, f) => n + f.rows, 0);
    cues[id] = {
      bank: j.bank,
      vary: 0,
      priority: 3,
      max: 1,
      loop: false,
      jingle: true,
      seconds: (rows * 60) / (j.song.bpm * j.song.rowsPerBeat),
      duck: { depth: j.duck, release: 1.5 },
    };
  }
  return cues;
}

function take(frames: number): Float32Array {
  for (let i = 0; i < pool.length; i++) {
    const b = pool[i] as Float32Array;
    if (b.length === frames) {
      pool.splice(i, 1);
      b.fill(0);
      return b;
    }
  }
  return new Float32Array(frames);
}

function send(message: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

function render(id: string): void {
  if (done.has(id)) return;
  done.add(id);
  const variants = renderEffect(id, EFFECTS[id] as EffectSource, sampleRate).variants;
  send(
    { type: "sound", id, variants },
    variants.map((v) => v.buffer),
  );
}

/** One sound per task, so song blocks asked for meanwhile are not held up. */
function next(): void {
  const id = queue.shift();
  if (id === undefined) return;
  render(id);
  setTimeout(next, 0);
}

function enqueue(bank: Bank): void {
  const idle = queue.length === 0;
  for (const [id, source] of Object.entries(EFFECTS)) if (bankOf(source) === bank) queue.push(id);
  if (idle) setTimeout(next, 0);
}

scope.onmessage = (e) => {
  const m = e.data;
  try {
    switch (m.type) {
      case "init":
        sampleRate = m.sampleRate;
        decks.clear();
        pool.length = 0;
        queue.length = 0;
        done.clear();
        send({ type: "catalog", cues: catalog() });
        enqueue("core");
        enqueue("combat");
        break;
      case "bank":
        enqueue(m.bank);
        break;
      case "render":
        if (m.id in EFFECTS) render(m.id);
        break;
      case "start": {
        if (m.kind === "song" || m.kind === "jingle") {
          const source =
            m.kind === "jingle" ? JINGLES[m.id]?.song : SONGS[m.id as keyof typeof SONGS];
          if (!source) throw new Error(`unknown song ${m.id}`);
          const song = compileSong(m.id, source);
          decks.set(m.deck, {
            gen: m.gen,
            player: new SongPlayer(song, sampleRate, m.seed, m.part),
            stems: song.stems.length,
          });
          send({
            type: "started",
            deck: m.deck,
            gen: m.gen,
            info: {
              title: source.title,
              stems: song.stems,
              bpm: source.bpm,
              rowsPerBar: song.rowsPerBar,
              loop: source.loop,
              parts: Object.keys(source.parts ?? {}),
            },
          });
        } else {
          const source = BEDS[m.id as keyof typeof BEDS];
          if (!source) throw new Error(`unknown ambient bed ${m.id}`);
          decks.set(m.deck, {
            gen: m.gen,
            player: new BedPlayer(source, sampleRate, m.seed),
            stems: 1,
          });
          send({
            type: "started",
            deck: m.deck,
            gen: m.gen,
            info: {
              title: source.title,
              stems: ["bed"],
              bpm: 0,
              rowsPerBar: 0,
              loop: 0,
              parts: [],
            },
          });
        }
        break;
      }
      case "part": {
        const deck = decks.get(m.deck);
        if (deck && deck.gen === m.gen && deck.player instanceof SongPlayer)
          deck.player.setPart(m.part);
        break;
      }
      case "stop":
        decks.delete(m.deck);
        break;
      case "pull": {
        for (const b of m.recycle) if (pool.length < 64) pool.push(b);
        const deck = decks.get(m.deck);
        if (!deck || deck.gen !== m.gen) break;
        const t0 = performance.now();
        const channels = Array.from({ length: deck.stems * 2 }, () => take(m.frames));
        let rows = new Int32Array(0);
        let ended = false;
        if (deck.player instanceof SongPlayer) {
          const marks = deck.player.render(channels, 0, m.frames);
          rows = new Int32Array(marks.length * 3);
          marks.forEach((k, i) => {
            rows[i * 3] = k.offset;
            rows[i * 3 + 1] = k.frame;
            rows[i * 3 + 2] = k.row;
          });
          ended = deck.player.finished;
        } else deck.player.render(channels, 0, m.frames);
        send(
          {
            type: "block",
            deck: m.deck,
            gen: m.gen,
            channels,
            rows,
            ended,
            ms: performance.now() - t0,
          },
          channels.map((c) => c.buffer),
        );
        break;
      }
    }
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
