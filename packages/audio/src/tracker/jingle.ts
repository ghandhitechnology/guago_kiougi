/** Renders a song that plays once into a stereo buffer, so it can be played like an effect. */

import { compileSong } from "./compile.ts";
import type { SongSource } from "./format.ts";
import { SongPlayer } from "./player.ts";

const BLOCK = 4096;
const MAX_SECONDS = 30;

export function renderJingle(
  id: string,
  source: SongSource,
  sr: number,
): [Float32Array, Float32Array] {
  const song = compileSong(id, { ...source, loop: false });
  const player = new SongPlayer(song, sr);
  const stems = song.stems.length;
  const blocks: Float32Array[][] = [];
  for (let n = 0; n < MAX_SECONDS * sr && !player.finished; n += BLOCK) {
    const out = Array.from({ length: stems * 2 }, () => new Float32Array(BLOCK));
    player.render(out, 0, BLOCK);
    blocks.push(out);
  }
  const length = blocks.length * BLOCK;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  blocks.forEach((out, b) => {
    for (let s = 0; s < stems; s++) {
      const l = out[s * 2] as Float32Array;
      const r = out[s * 2 + 1] as Float32Array;
      for (let i = 0; i < BLOCK; i++) {
        left[b * BLOCK + i] = (left[b * BLOCK + i] as number) + (l[i] as number);
        right[b * BLOCK + i] = (right[b * BLOCK + i] as number) + (r[i] as number);
      }
    }
  });
  // Trim the silent tail, then fade the last 20 ms.
  let end = length;
  while (
    end > 0 &&
    Math.abs(left[end - 1] as number) < 3e-4 &&
    Math.abs(right[end - 1] as number) < 3e-4
  )
    end--;
  const fade = Math.min(end, Math.round(0.02 * sr));
  for (let i = 0; i < fade; i++) {
    const k = end - 1 - i;
    left[k] = (left[k] as number) * (i / fade);
    right[k] = (right[k] as number) * (i / fade);
  }
  return [left.slice(0, end), right.slice(0, end)];
}
