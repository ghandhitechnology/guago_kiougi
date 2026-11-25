/**
 * Map review views shared by the static sheet and the page: the screens worth looking at in a
 * map (one around each spawn, one on the landmark), and the overlay that shows what the server
 * sees: collision, portals, spawns, interactables and zones over the darkened map.
 * Browser-safe.
 */
import type { BuiltMap, Rect } from "@guago/content";
import { type Pixels, SCREEN } from "../scene.ts";

export interface MapView {
  readonly name: string;
  readonly rect: Rect;
}

/** A screen-sized window centred on a point, kept inside the map. */
export function windowAround(map: BuiltMap, x: number, y: number): Rect {
  const W = map.w * 16;
  const H = map.h * 16;
  const w = Math.min(SCREEN.w, W);
  const h = Math.min(SCREEN.h, H);
  return {
    x: Math.max(0, Math.min(W - w, Math.round(x - w / 2))),
    y: Math.max(0, Math.min(H - h, Math.round(y - h / 2))),
    w,
    h,
  };
}

/** One screen per spawn, then the landmark. */
export function mapViews(map: BuiltMap): MapView[] {
  return [
    ...Object.entries(map.spawns).map(([name, s]) => ({
      name: `spawn-${name}`,
      rect: windowAround(map, s.x, s.y - 24),
    })),
    {
      name: "landmark",
      rect: windowAround(map, map.landmark.x, map.landmark.y - 32),
    },
  ];
}

type Rgb = readonly [number, number, number];
type Ramps = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface Label {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly color: Rgb;
}

/** Overlay colours, by what they mark. */
const MARKS = {
  solid: "red.mid",
  water: "navy.light",
  portal: "grass.pale",
  planned: "gold.light",
  spawn: "stone.bright",
  thing: "sea.light",
  safe: "board.light",
  logout: "plum.light",
  monsters: "red.light",
  gather: "rose.light",
  arena: "clay.pale",
  npc: "gold.pale",
  mark: "navy.pale",
} as const;

function rgb(ramps: Ramps, name: string): Rgb {
  const [ramp, step] = name.split(".");
  const hex = ramps[ramp ?? ""]?.[step ?? ""] ?? "#ff00ff";
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The overlay view at `scale`: the map darkened, solid tiles hatched red, water hatched blue,
 * then outlines for zones, interactables and portals (planned ones dashed), and a cross on each
 * spawn. Labels come back separately, for each sheet to letter in its own font.
 */
export function overlay(
  map: BuiltMap,
  base: Pixels,
  scale: number,
  ramps: Ramps,
): { w: number; h: number; data: Uint8ClampedArray; labels: Label[] } {
  const w = base.w * scale;
  const h = base.h * scale;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / scale) * base.w + Math.floor(x / scale)) * 4;
      const d = (y * w + x) * 4;
      data[d] = (base.data[s] as number) * 0.42;
      data[d + 1] = (base.data[s + 1] as number) * 0.42;
      data[d + 2] = (base.data[s + 2] as number) * 0.42;
      data[d + 3] = 255;
    }
  }
  const T = 16 * scale;
  const put = (x: number, y: number, c: Rgb) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const d = (y * w + x) * 4;
    data[d] = c[0];
    data[d + 1] = c[1];
    data[d + 2] = c[2];
  };
  const tint = (x: number, y: number, c: Rgb, k: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const d = (y * w + x) * 4;
    data[d] = (data[d] as number) * (1 - k) + c[0] * k;
    data[d + 1] = (data[d + 1] as number) * (1 - k) + c[1] * k;
    data[d + 2] = (data[d + 2] as number) * (1 - k) + c[2] * k;
  };
  const solid = rgb(ramps, MARKS.solid);
  const water = rgb(ramps, MARKS.water);
  map.collision.rows.forEach((row, ty) => {
    [...row].forEach((ch, tx) => {
      if (ch === ".") return;
      const c = ch === "~" ? water : solid;
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const hatch = (x + y) % (4 * scale) < scale;
          tint(tx * T + x, ty * T + y, c, hatch ? 0.8 : 0.22);
        }
      }
    });
  });
  const labels: Label[] = [];
  const box = (r: Rect, c: Rgb, dashed: boolean, inset: number) => {
    const x0 = r.x * T + inset;
    const y0 = r.y * T + inset;
    const x1 = (r.x + r.w) * T - 1 - inset;
    const y1 = (r.y + r.h) * T - 1 - inset;
    for (let t = 0; t < scale; t++) {
      for (let x = x0; x <= x1; x++) {
        if (dashed && Math.floor((x - x0) / (3 * scale)) % 2) continue;
        put(x, y0 + t, c);
        put(x, y1 - t, c);
      }
      for (let y = y0; y <= y1; y++) {
        if (dashed && Math.floor((y - y0) / (3 * scale)) % 2) continue;
        put(x0 + t, y, c);
        put(x1 - t, y, c);
      }
    }
  };
  for (const z of map.zones) {
    const c = rgb(ramps, MARKS[z.kind]);
    box(z.rect, c, false, 0);
    const what = z.kind === "monsters" ? `${z.monster} ${z.density}` : z.kind;
    labels.push({
      text: `${z.id} · ${what}`,
      x: z.rect.x * T + 3 * scale,
      y: z.rect.y * T + 2 * scale,
      color: c,
    });
  }
  for (const t of map.interactables) {
    const c = rgb(ramps, MARKS.thing);
    box(t.rect, c, false, scale);
    labels.push({
      text: `${t.id} · ${t.kind}`,
      x: t.rect.x * T,
      y: (t.rect.y + t.rect.h) * T + scale,
      color: c,
    });
  }
  for (const p of map.portals) {
    const c = rgb(ramps, p.built ? MARKS.portal : MARKS.planned);
    box(p.rect, c, !p.built, scale);
    for (let y = p.rect.y * T; y < (p.rect.y + p.rect.h) * T; y++)
      for (let x = p.rect.x * T; x < (p.rect.x + p.rect.w) * T; x++) tint(x, y, c, 0.3);
    labels.push({
      text: `→ ${p.to}${p.built ? "" : " (planned)"}`,
      x: p.rect.x * T,
      y: (p.rect.y + p.rect.h) * T + scale,
      color: c,
    });
  }
  const sc = rgb(ramps, MARKS.spawn);
  for (const [name, s] of Object.entries(map.spawns)) {
    const cx = s.x * scale;
    const cy = s.y * scale;
    for (let k = -6 * scale; k <= 6 * scale; k++) {
      for (let t = -Math.floor(scale / 2); t <= Math.floor(scale / 2); t++) {
        put(cx + k, cy + t, sc);
        put(cx + t, cy + k, sc);
      }
    }
    labels.push({ text: name, x: cx + 8 * scale, y: cy - 6 * scale, color: sc });
  }
  // Arenas, NPC spots by speaker, and the marks cutscenes walk people to.
  for (const a of map.arenas ?? []) {
    const c = rgb(ramps, MARKS.arena);
    box(a.rect, c, true, 2 * scale);
    labels.push({
      text: `${a.id} · arena ${a.modes.join(" ")}`,
      x: a.rect.x * T + 4 * scale,
      y: a.rect.y * T + 4 * scale,
      color: c,
    });
  }
  const dot = (x: number, y: number, r: number, c: Rgb) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r) put(x + dx, y + dy, c);
  };
  for (const n of map.npcs ?? []) {
    const c = rgb(ramps, MARKS.npc);
    dot(n.x * scale, n.y * scale, 4 * scale, c);
    labels.push({ text: n.speaker, x: (n.x + 6) * scale, y: (n.y - 4) * scale, color: c });
  }
  for (const [name, m] of Object.entries(map.marks ?? {})) {
    const c = rgb(ramps, MARKS.mark);
    dot(m.x * scale, m.y * scale, 2 * scale, c);
    labels.push({ text: `@${name}`, x: (m.x + 4) * scale, y: (m.y + 2) * scale, color: c });
  }
  return { w, h, data, labels };
}
