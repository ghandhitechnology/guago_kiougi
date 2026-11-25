/**
 * The audio worker: renders songs and ambient beds block by block, and every effect once at
 * start-up. Nothing here touches the main thread, so a phone's frame rate does not pay for synthesis.
 */

import { BedPlayer } from "../ambient/bed.ts";
import { BEDS, EFFECTS, SONGS } from "../content/index.ts";
import { renderEffect } from "../sfx/render.ts";
import { compileSong } from "../tracker/compile.ts";
import { SongPlayer } from "../tracker/player.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

interface Scope {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
}
const scope = self as unknown as Scope;

let sampleRate = 48000;
const decks = new Map<number, { gen: number; player: SongPlayer | BedPlayer; stems: number }>();
const pool: Float32Array[] = [];

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

const queue: string[] = [];
function nextEffect(): void {
  const id = queue.shift();
  if (!id) return;
  const r = renderEffect(id, EFFECTS[id as keyof typeof EFFECTS], sampleRate);
  send(
    { type: "effect", id, variants: r.variants, loop: r.loop },
    r.variants.map((v) => v.buffer),
  );
  setTimeout(nextEffect, 0);
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
        break;
      case "effects":
        // One effect per task, so song blocks asked for meanwhile are not held up.
        queue.push(...Object.keys(EFFECTS));
        setTimeout(nextEffect, 0);
        break;
      case "start": {
        const seed = m.seed;
        if (m.kind === "song") {
          const source = SONGS[m.id as keyof typeof SONGS];
          if (!source) throw new Error(`unknown song ${m.id}`);
          const song = compileSong(m.id, source);
          decks.set(m.deck, {
            gen: m.gen,
            player: new SongPlayer(song, sampleRate, seed),
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
            },
          });
        } else {
          const source = BEDS[m.id as keyof typeof BEDS];
          if (!source) throw new Error(`unknown ambient bed ${m.id}`);
          decks.set(m.deck, {
            gen: m.gen,
            player: new BedPlayer(source, sampleRate, seed),
            stems: 1,
          });
          send({
            type: "started",
            deck: m.deck,
            gen: m.gen,
            info: { title: source.title, stems: ["bed"], bpm: 0, rowsPerBar: 0, loop: 0 },
          });
        }
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
