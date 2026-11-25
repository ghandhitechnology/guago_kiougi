import { type SpriteDef, sprite } from "./format.ts";
import { IL } from "./interior.ts";
import type { Pic } from "./paint.ts";

/**
 * Page 1's own sprites: drawn in the interior legend, lit from the top left, packed in the
 * `page1` atlas, which loads with the rift.
 */
const GROUP = "page1";

type Extra = Partial<Omit<SpriteDef, "kind" | "name" | "size" | "frames" | "palette">>;

/** A Page 1 sprite from named frames; the first frame is the idle unless `anim` says otherwise. */
export function greek(name: string, list: Readonly<Record<string, Pic>>, extra: Extra = {}) {
  const entries = Object.entries(list);
  const first = entries[0]?.[1] as Pic;
  return sprite({
    name,
    group: GROUP,
    size: [first.w, first.h],
    palette: IL,
    frames: Object.fromEntries(entries.map(([k, v]) => [k, v.toString()])),
    anim: { idle: { frames: [entries[0]?.[0] ?? ""], fps: 1 } },
    ...extra,
  });
}

export const hash = (x: number, y: number, s = 0) => {
  let v = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 2 ** 32;
};
