/**
 * Build-time art checks (PLAN §16 "Reviewing art without an artist"). Each returns readable
 * problems naming the art, frame and pixel; the build fails if any are found.
 */
import type { Anim } from "./format.ts";
import { INDEX_RGB, nameOf, RAMP_LIST, SLOT_STEPS, slotOf } from "./palette.ts";
import { CLEAR, type Indexed, opaqueCount } from "./raster.ts";

const N8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;
const N4 = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
] as const;

/** Every pixel is a palette colour or a swap-slot key. */
export function checkPalette(img: Indexed, where: string): string[] {
  const out: string[] = [];
  img.px.forEach((v, i) => {
    if (v !== CLEAR && v >= INDEX_RGB.length) {
      out.push(`${where} (${i % img.w},${Math.floor(i / img.w)}): index ${v} is not in 해솔 64`);
    }
  });
  return out;
}

/**
 * No pixel without a same-colour neighbour in 8 directions, unless drawn with a lone character.
 * With `openEdges`, pixels on the border are skipped because their neighbours live in the next
 * tile.
 */
export function checkOrphans(img: Indexed, where: string, openEdges = false): string[] {
  const out: string[] = [];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = y * img.w + x;
      const v = img.px[i];
      if (v === CLEAR || img.lone[i]) continue;
      if (openEdges && (x === 0 || y === 0 || x === img.w - 1 || y === img.h - 1)) continue;
      const paired = N8.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < img.w && ny < img.h && img.px[ny * img.w + nx] === v;
      });
      if (!paired) out.push(`${where} (${x},${y}): orphan ${nameOf(v as number)} pixel`);
    }
  }
  return out;
}

/** The darkest step of every ramp and slot the image uses. */
export function outlineColors(img: Indexed): Map<number, string> {
  const used = new Set(img.px);
  const allowed = new Map<number, string>();
  for (const ramp of RAMP_LIST) {
    const deep = ramp.indices[0] as number;
    const members = [...ramp.indices, ...ramp.extras.values()];
    if (members.some((i) => used.has(i)) && !allowed.has(deep)) {
      allowed.set(deep, `${ramp.name}.deep`);
    }
  }
  for (const v of used) {
    const slot = slotOf(v);
    if (slot) allowed.set(slot.base, `${slot.name}.${SLOT_STEPS[0]}`);
  }
  return allowed;
}

/**
 * Every opaque pixel that touches transparency (or the frame edge) on one of its four sides is
 * an outline pixel, and must be the darkest step of a ramp the sprite uses. Lone pixels skip it.
 */
export function checkOutline(img: Indexed, where: string): string[] {
  const allowed = outlineColors(img);
  const out: string[] = [];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = y * img.w + x;
      const v = img.px[i] as number;
      if (v === CLEAR || img.lone[i]) continue;
      const edge = N4.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx < 0 || ny < 0 || nx >= img.w || ny >= img.h || img.px[ny * img.w + nx] === CLEAR;
      });
      if (edge && !allowed.has(v)) {
        const want = [...allowed.values()].join(", ") || "a ramp's deep step";
        out.push(`${where} (${x},${y}): outline pixel is ${nameOf(v)}, expected ${want}`);
      }
    }
  }
  return out;
}

/** Consecutive frames of one animation keep a similar pixel count. */
export function checkJumps(
  name: string,
  anim: Anim,
  count: (frame: string) => number,
  where: string,
): string[] {
  const limit = anim.jump ?? 0.35;
  const frames = anim.frames;
  const pairs = frames.length > 1 && (anim.loop ?? true) ? frames.length : frames.length - 1;
  const out: string[] = [];
  for (let i = 0; i < pairs; i++) {
    const a = frames[i] as string;
    const b = frames[(i + 1) % frames.length] as string;
    const ca = count(a);
    const cb = count(b);
    const change = Math.abs(ca - cb) / Math.max(1, ca, cb);
    if (change > limit) {
      out.push(
        `${where} › anim ${name}: ${a} → ${b} changes ${ca} → ${cb} pixels (${Math.round(change * 100)}%, limit ${Math.round(limit * 100)}%)`,
      );
    }
  }
  return out;
}

export { opaqueCount };
