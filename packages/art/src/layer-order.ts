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
