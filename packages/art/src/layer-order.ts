/**
 * The order a rig look's layers are drawn in, with each part placed where its `under` rule puts
 * it (see `PartDef.under`). Pure, so the build, the scenes and the contact sheet page share it.
 */
export function drawOrder(
  layers: readonly string[],
  look: Readonly<Record<string, string>>,
  underOf: (layer: string, part: string) => string | undefined,
): string[] {
  const below = (layer: string): string | undefined => {
    const part = look[layer];
    const under = part === undefined ? undefined : underOf(layer, part);
    return under === layer ? undefined : under;
  };
  const out: string[] = [];
  for (const layer of layers) {
    for (const other of layers) if (below(other) === layer) out.push(other);
    if (below(layer) === undefined) out.push(layer);
  }
  return out;
}

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

/**
 * Stacks layer images back to front into one. With `clean` (a rig's `clean` rule), a pixel that
 * had a same-colour neighbour in its own layer but has none once later layers are drawn, a
 * stray left where a clip, a strap or a raised arm cuts across hair or cloth, takes the colour
 * of a neighbour from a later layer: whatever stranded it hides it. A stray on the outline takes
 * an outline colour when one is next to it.
 *
 * Colours are any integers (palette indices in the build, packed RGB in a browser) with `empty`
 * for clear. Run it before slot colours are swapped in, so `isOutline` can name slot keys.
 */
export function stackLayers(
  layers: readonly ArrayLike<number>[],
  w: number,
  h: number,
  empty: number,
  clean: boolean,
  isOutline: (color: number) => boolean,
): { px: Int32Array; owner: Int16Array } {
  const px = new Int32Array(w * h).fill(empty);
  const owner = new Int16Array(w * h).fill(-1);
  layers.forEach((layer, l) => {
    for (let i = 0; i < w * h; i++) {
      const c = layer[i] as number;
      if (c === empty) continue;
      px[i] = c;
      owner[i] = l;
    }
  });
  if (!clean) return { px, owner };
  const at = (img: ArrayLike<number>, x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? empty : (img[y * w + x] as number);
  const strays: [number, number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = owner[i] as number;
      if (l < 0) continue;
      const c = px[i] as number;
      const own = layers[l] as ArrayLike<number>;
      if (N8.some(([dx, dy]) => at(px, x + dx, y + dy) === c)) continue;
      if (!N8.some(([dx, dy]) => at(own, x + dx, y + dy) === c)) continue;
      const above = N8.map(([dx, dy]) => [x + dx, y + dy] as const).filter(
        ([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h && (owner[ny * w + nx] as number) > l,
      );
      const edge = N4.some(([dx, dy]) => at(px, x + dx, y + dy) === empty);
      const pick =
        (edge && above.find(([nx, ny]) => isOutline(px[ny * w + nx] as number))) || above[0];
      if (pick)
        strays.push([
          i,
          px[pick[1] * w + pick[0]] as number,
          owner[pick[1] * w + pick[0]] as number,
        ]);
    }
  }
  for (const [i, c, l] of strays) {
    px[i] = c;
    owner[i] = l;
  }
  return { px, owner };
}

/** Packs RGBA pixels into `0xRRGGBB` integers, `-1` where clear. */
export function packRgba(data: ArrayLike<number>): Int32Array {
  const out = new Int32Array(data.length / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] =
      (data[i * 4 + 3] as number) === 0
        ? -1
        : ((data[i * 4] as number) << 16) |
          ((data[i * 4 + 1] as number) << 8) |
          (data[i * 4 + 2] as number);
  }
  return out;
}

/**
 * The outline colours of the build's metadata as packed RGB, for `stackLayers` in a browser:
 * every ramp's `deep` step and every slot's `deep` key.
 */
export function outlineColors(meta: {
  readonly palette: { readonly ramps: Readonly<Record<string, Readonly<Record<string, string>>>> };
  readonly slots: Readonly<Record<string, { readonly keys: Readonly<Record<string, string>> }>>;
}): Set<number> {
  const hex = (h: string | undefined) => (h ? Number.parseInt(h.slice(1), 16) : -1);
  return new Set([
    ...Object.values(meta.palette.ramps).map((r) => hex(r.deep)),
    ...Object.values(meta.slots).map((s) => hex(s.keys.deep)),
  ]);
}
