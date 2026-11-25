/**
 * 해솔 64: the master palette (PLAN §16 "Palette").
 *
 * Ramps run dark to light. Step names are positional: `deep` is always the darkest step and the
 * outline colour, then `dark`, `mid`, `light`, `pale`, `bright` as far as the ramp goes.
 * Shadows lean cool, highlights lean warm. Some ramps share an end colour on purpose so that
 * materials blend where they meet.
 */

export const STEPS = ["deep", "dark", "mid", "light", "pale", "bright"] as const;
export type Step = (typeof STEPS)[number];

// Shared end colours.
const NIGHT = "#1a1427"; // darkest colour in the game
const SLATE = "#2a2741"; // ink.dark, navy.deep
const DUSK = "#484662"; // ink.mid, stone.deep
const ASH = "#6a6276"; // stone.dark, ink.light
const WINE = "#3d1426"; // red.deep, clay.deep
const BRICK = "#7a3329"; // clay.dark, flesh.dark
const UMBER = "#4f2d26"; // wood.dark, gold.deep, flesh.deep
const FOREST = "#173230"; // grass.deep, board.deep
const PINE = "#336555"; // board.mid, grass.dark
const PLUMSHADE = "#4a2758"; // plum.dark, rose.deep

/**
 * Core ramps. `flesh` is the fixed skin ramp: the `skin` swap slot keeps the name `skin`, so a
 * legend asks for a fixed skin colour as `flesh.pale` and for the slot as `skin.mid`.
 *
 * Revision 2 merged four near-identical pairs to free room for the steps in `EXTRAS`; the old
 * names are aliases of the survivor: `ink.light` #706f8a → `stone.dark` #6a6276,
 * `skin.deep` #4b2629 → `wood.dark` #4f2d26, `skin.dark` #773f35 → `clay.dark` #7a3329,
 * `grass.dark` #23533a → `board.mid` #336555.
 */
const RAMPS = {
  ink: [NIGHT, SLATE, DUSK, ASH],
  stone: [DUSK, ASH, "#958b93", "#bdb2ab", "#e0d5c2", "#faf2e1"],
  red: [WINE, "#751a30", "#b8293a", "#e3513f", "#ff9268"],
  clay: [WINE, BRICK, "#b5582f", "#dc8a4a", "#f4c185"],
  gold: [UMBER, "#8c5524", "#c98b25", "#efc244", "#fbe8a0"],
  wood: ["#2f1b24", UMBER, "#7d5039", "#a8784e", "#d0a56f"],
  flesh: [UMBER, BRICK, "#a25e46", "#ca8a64", "#e9b58d", "#f9dcbc"],
  grass: [FOREST, PINE, "#3c7d3b", "#6aa845", "#acd26a", "#e0ee9c"],
  olive: ["#34331f", "#5a5a30", "#858645", "#b3b16b"],
  board: [FOREST, "#22463f", PINE, "#518d76"],
  navy: [SLATE, "#2b3a6d", "#3c5ca2", "#5e8bd0", "#99c0ea"],
  sea: ["#143e5b", "#196e91", "#22a5c3", "#58d8d6", "#b6f6e5"],
  plum: ["#2a1636", PLUMSHADE, "#763f86", "#a868ad", "#d9a3cc"],
  rose: [PLUMSHADE, "#953a68", "#cf5f80", "#f297a0", "#ffcdbf"],
} as const satisfies Record<string, readonly string[]>;

/**
 * Extra named steps that sit between two core steps of a ramp, each with the core step it
 * shades down to. They are full palette colours but stay out of the step order that shadows,
 * outlines and `ramp.*` remaps follow, so adding one never shifts another colour.
 */
const EXTRAS = {
  /** A lawn green between `grass.mid` and `grass.light`, for soft tonal patches. */
  "grass.soft": ["#53923f", "grass.mid"],
  /** Stone under a warm lamp: a lit grey, not a brown. */
  "stone.lamp": ["#d5c3a0", "stone.light"],
  /** Marble's warm shadow, between `stone.mid` and `stone.light`. */
  "stone.vein": ["#a89a8c", "stone.mid"],
  /** Sunlit dust between `clay.light` and `clay.pale`. */
  "clay.dust": ["#e8a768", "clay.light"],
} as const;

export type RampName = keyof typeof RAMPS;

type StepNames<
  T extends readonly unknown[],
  S extends readonly string[] = typeof STEPS,
> = T extends readonly [unknown, ...infer Rest]
  ? S extends readonly [infer H extends string, ...infer SRest extends string[]]
    ? H | StepNames<Rest, SRest>
    : never
  : never;

export type ExtraName = keyof typeof EXTRAS;

/** Every addressable palette name, like `red.deep`, `stone.bright` or `grass.soft`. */
export type ColorName =
  | {
      [R in RampName]: `${R}.${StepNames<(typeof RAMPS)[R]>}`;
    }[RampName]
  | ExtraName;

export interface Ramp {
  readonly name: RampName;
  readonly steps: readonly Step[];
  /** Palette indices of the steps, dark to light. */
  readonly indices: readonly number[];
  /** Extra named steps of this ramp, name to palette index. */
  readonly extras: ReadonlyMap<string, number>;
}

/** The 64 unique colours, in first-seen order. Index into this is a palette index. */
export const COLORS: readonly string[] = [
  ...new Set([...Object.values(RAMPS).flat(), ...Object.values(EXTRAS).map(([hex]) => hex)]),
];

export const RAMP_LIST: readonly Ramp[] = Object.entries(RAMPS).map(([name, hexes]) => ({
  name: name as RampName,
  steps: STEPS.slice(0, hexes.length),
  indices: hexes.map((h) => COLORS.indexOf(h)),
  extras: new Map(
    Object.entries(EXTRAS)
      .filter(([extra]) => extra.startsWith(`${name}.`))
      .map(([extra, [hex]]) => [extra.slice(name.length + 1), COLORS.indexOf(hex)]),
  ),
}));

const NAME_TO_INDEX = new Map<string, number>();
for (const ramp of RAMP_LIST) {
  ramp.steps.forEach((step, i) => {
    NAME_TO_INDEX.set(`${ramp.name}.${step}`, ramp.indices[i] as number);
  });
  for (const [extra, index] of ramp.extras) NAME_TO_INDEX.set(`${ramp.name}.${extra}`, index);
}
// In code, `skin.<step>` still names the fixed skin colours; in a legend it is the swap slot.
for (const step of STEPS) {
  const index = NAME_TO_INDEX.get(`flesh.${step}`);
  if (index !== undefined) NAME_TO_INDEX.set(`skin.${step}`, index);
}

/** Every ramp name and step in display order (extras slot in above the step they shade to). */
export function rampEntries(ramp: Ramp): [name: string, index: number][] {
  const out: [string, number][] = [];
  ramp.steps.forEach((step, i) => {
    out.push([step, ramp.indices[i] as number]);
    for (const [extra, [, below]] of Object.entries(EXTRAS)) {
      if (below === `${ramp.name}.${step}`)
        out.push([extra.split(".")[1] as string, NAME_TO_INDEX.get(extra) as number]);
    }
  });
  return out;
}

export function isColorName(name: string): name is ColorName {
  return NAME_TO_INDEX.has(name);
}

/** Palette index of a colour name. Throws on an unknown name. */
export function colorIndex(name: string): number {
  const index = NAME_TO_INDEX.get(name);
  if (index === undefined) throw new Error(`unknown palette name "${name}"`);
  return index;
}

/** Indices that are the darkest step of at least one ramp: the legal outline colours. */
export const DEEP_INDICES: ReadonlySet<number> = new Set(
  RAMP_LIST.map((r) => r.indices[0] as number),
);

/**
 * One step darker per colour, along the ramp where the colour is not the darkest step (a shared
 * end colour like `wood.dark` / `gold.deep` shades along wood). Deep steps stay. Ground shadows
 * use this, so a shadow keeps the texture under it.
 */
export const SHADE: ReadonlyMap<number, number> = new Map(
  COLORS.map((_, i) => {
    const extra = Object.values(EXTRAS).find(([hex]) => COLORS.indexOf(hex) === i);
    if (extra) return [i, NAME_TO_INDEX.get(extra[1]) as number];
    const ramp = RAMP_LIST.find((r) => r.indices.indexOf(i) > 0);
    return [i, ramp ? (ramp.indices[ramp.indices.indexOf(i) - 1] as number) : i];
  }),
);

/** Ramps that contain a palette index, as a step or an extra. A shared end colour belongs to several. */
export function rampsOf(index: number): readonly Ramp[] {
  return RAMP_LIST.filter(
    (r) => r.indices.includes(index) || [...r.extras.values()].includes(index),
  );
}

export function rampByName(name: string): Ramp | undefined {
  return RAMP_LIST.find((r) => r.name === name);
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

if (COLORS.length !== 64) {
  throw new Error(`해솔 64 must have exactly 64 colours, has ${COLORS.length}`);
}

// Swap slots ----------------------------------------------------------------------------------

type Four = readonly [ColorName, ColorName, ColorName, ColorName];

/**
 * Swap slots: one grid, many colours. A legend can paint `hair.mid` instead of a fixed colour.
 * The compiler writes those pixels in reserved key colours, and a consumer swaps the keys for
 * one of the slot's options at composite time. Every slot has the steps deep, dark, mid, light.
 */
const SLOT_OPTIONS = {
  skin: {
    fair: ["flesh.dark", "flesh.light", "flesh.pale", "flesh.bright"],
    warm: ["flesh.deep", "flesh.mid", "flesh.light", "flesh.pale"],
    deep: ["flesh.deep", "flesh.dark", "flesh.mid", "flesh.light"],
  },
  hair: {
    black: ["ink.deep", "ink.dark", "ink.mid", "ink.light"],
    brown: ["wood.deep", "wood.dark", "wood.mid", "wood.light"],
    chestnut: ["clay.deep", "clay.dark", "clay.mid", "clay.light"],
    blond: ["gold.dark", "gold.mid", "gold.light", "gold.pale"],
    red: ["red.deep", "red.dark", "red.mid", "red.light"],
    silver: ["stone.deep", "stone.mid", "stone.light", "stone.pale"],
    blue: ["navy.deep", "navy.dark", "navy.mid", "navy.light"],
    pink: ["rose.deep", "rose.dark", "rose.mid", "rose.light"],
    green: ["board.deep", "board.dark", "board.mid", "board.light"],
    violet: ["plum.deep", "plum.dark", "plum.mid", "plum.light"],
  },
  jacket: {
    navy: ["navy.deep", "navy.dark", "navy.mid", "navy.light"],
    crimson: ["red.deep", "red.dark", "red.mid", "red.light"],
    forest: ["grass.deep", "grass.dark", "grass.mid", "grass.light"],
    violet: ["plum.deep", "plum.dark", "plum.mid", "plum.light"],
    mustard: ["wood.dark", "gold.dark", "gold.mid", "gold.light"],
    ash: ["ink.dark", "ink.mid", "ink.light", "stone.light"],
  },
} as const satisfies Record<string, Record<string, Four>>;

export const SLOT_STEPS = ["deep", "dark", "mid", "light"] as const;
export type SlotName = keyof typeof SLOT_OPTIONS;
export type SlotColorName = `${SlotName}.${(typeof SLOT_STEPS)[number]}`;
export type SlotOption<S extends SlotName> = keyof (typeof SLOT_OPTIONS)[S];

export interface Slot {
  readonly name: SlotName;
  /** Index of the slot's first key. Step i has index `base + i`. */
  readonly base: number;
  /** Key colour per step, as written into atlas pixels. */
  readonly keys: readonly string[];
  readonly options: Readonly<Record<string, readonly ColorName[]>>;
}

export const SLOTS: readonly Slot[] = Object.entries(SLOT_OPTIONS).map(([name, options], s) => ({
  name: name as SlotName,
  base: COLORS.length + s * SLOT_STEPS.length,
  keys: SLOT_STEPS.map((_, i) => `#ff00${(0x80 + s * 16 + i).toString(16)}`),
  options,
}));

for (const slot of SLOTS) {
  for (const key of slot.keys) {
    if (COLORS.includes(key)) throw new Error(`slot key ${key} collides with the palette`);
  }
}

/** Index of a palette or slot name. Throws on an unknown name. */
export function paintIndex(name: string): number {
  const [head, step] = name.split(".");
  const slot = SLOTS.find((s) => s.name === head);
  if (slot) {
    const i = SLOT_STEPS.indexOf(step as (typeof SLOT_STEPS)[number]);
    if (i < 0) {
      const fixed = head === "skin" ? ` (fixed skin colours are "flesh.${step}")` : "";
      throw new Error(`unknown slot step "${name}"${fixed}`);
    }
    return slot.base + i;
  }
  return colorIndex(name);
}

/** The slot an index belongs to, or undefined for palette indices. */
export function slotOf(index: number): Slot | undefined {
  return SLOTS.find((s) => index >= s.base && index < s.base + SLOT_STEPS.length);
}

/** RGB for every index: the 64 colours, then every slot key. */
export const INDEX_RGB: readonly (readonly [number, number, number])[] = [
  ...COLORS,
  ...SLOTS.flatMap((s) => s.keys),
].map(hexToRgb);

/** Index to RGB with each slot resolved to one of its options, for previews. */
export function previewLut(
  choice: Readonly<Partial<Record<SlotName, string>>>,
): (readonly [number, number, number])[] {
  const lut = [...INDEX_RGB];
  for (const slot of SLOTS) {
    const option = choice[slot.name] ?? Object.keys(slot.options)[0];
    const names = option === undefined ? undefined : slot.options[option];
    if (!names) throw new Error(`slot ${slot.name} has no option "${option}"`);
    names.forEach((n, i) => {
      lut[slot.base + i] = INDEX_RGB[colorIndex(n)] as readonly [number, number, number];
    });
  }
  return lut;
}

// Themes --------------------------------------------------------------------------------------

/**
 * A remap of palette names. `'grass.*': 'olive.*'` maps every step of a ramp to the same step
 * of another; `'grass.pale': 'stone.pale'` maps one colour. Later entries win. Names merged in
 * revision 2 share one index, so a theme maps the survivor once (`stone.dark`, `board.mid`) and
 * the alias (`ink.light`, `grass.dark`) follows it.
 */
export type Remap = Readonly<Record<string, string>>;

/** Resolves a remap to palette index pairs. Throws with the offending entry. */
export function resolveRemap(remap: Remap): Map<number, number> {
  const out = new Map<number, number>();
  for (const [from, to] of Object.entries(remap)) {
    if (from.endsWith(".*") !== to.endsWith(".*")) {
      throw new Error(`remap "${from}" → "${to}": both sides need ".*" or neither`);
    }
    if (!from.endsWith(".*")) {
      out.set(colorIndex(from), colorIndex(to));
      continue;
    }
    const a = rampByName(from.slice(0, -2));
    const b = rampByName(to.slice(0, -2));
    if (!a) throw new Error(`remap "${from}": unknown ramp`);
    if (!b) throw new Error(`remap "${to}": unknown ramp`);
    a.steps.forEach((step, i) => {
      const j = b.steps.indexOf(step);
      if (j < 0) throw new Error(`remap "${from}" → "${to}": ${b.name} has no step "${step}"`);
      out.set(a.indices[i] as number, b.indices[j] as number);
    });
    // Extras go to the same extra in the target, or to the target's step they shade to.
    for (const [extra, index] of a.extras) {
      const same = b.extras.get(extra);
      const below = EXTRAS[`${a.name}.${extra}` as ExtraName][1].split(".")[1] as Step;
      const j = b.steps.indexOf(below);
      if (same !== undefined) out.set(index, same);
      else if (j >= 0) out.set(index, b.indices[j] as number);
    }
  }
  return out;
}

export interface Theme {
  readonly name: string;
  readonly remap: Remap;
}

/** An era theme: a named remap applied to tile art when its atlas is baked. */
export function theme(name: string, remap: Remap): Theme {
  resolveRemap(remap);
  return { name, remap };
}

/**
 * Campus after dark. Surfaces drop about two steps and lean blue; `gold.light`, `gold.pale`,
 * `sea.light` and `sea.pale` are left alone because lit windows, lamps and screens are drawn in
 * them and keep glowing.
 */
const CAMPUS_NIGHT = theme("campus-night", {
  "ink.mid": "ink.dark",
  "ink.dark": "ink.deep",
  "stone.bright": "stone.dark",
  "stone.pale": "ink.mid",
  "stone.light": "ink.mid",
  "stone.mid": "ink.dark",
  "stone.dark": "ink.deep",
  "grass.bright": "board.light",
  "grass.pale": "board.mid",
  "grass.light": "board.dark",
  "grass.mid": "board.deep",
  "board.light": "board.mid",
  "board.mid": "board.dark",
  "board.dark": "board.deep",
  "olive.light": "olive.dark",
  "olive.mid": "olive.deep",
  "olive.dark": "olive.deep",
  "wood.pale": "stone.dark",
  "wood.light": "plum.dark",
  "wood.mid": "wood.deep",
  "wood.dark": "wood.deep",
  "wood.deep": "ink.deep",
  "clay.pale": "stone.dark",
  "clay.light": "clay.dark",
  "clay.mid": "clay.dark",
  "clay.dark": "clay.deep",
  "red.pale": "rose.dark",
  "red.light": "red.dark",
  "red.mid": "red.dark",
  "red.dark": "red.deep",
  "gold.mid": "gold.dark",
  "gold.dark": "wood.deep",
  "navy.pale": "navy.mid",
  "navy.light": "navy.dark",
  "navy.mid": "navy.dark",
  "navy.dark": "ink.dark",
  "sea.mid": "sea.dark",
  "sea.dark": "sea.deep",
  "plum.pale": "plum.mid",
  "plum.light": "plum.dark",
  "plum.mid": "plum.dark",
  "plum.dark": "plum.deep",
  "rose.pale": "rose.mid",
  "rose.light": "rose.dark",
  "rose.mid": "rose.dark",
  "rose.dark": "plum.dark",
  "grass.soft": "board.dark",
  "stone.lamp": "ink.mid",
  "stone.vein": "ink.dark",
  "clay.dust": "stone.dark",
});

/**
 * Lamp light at night, in three bands from the lamp out. Pavers under the lamp turn the lamp-lit
 * grey with warm joints, so the pool reads as light on stone; grass softens to the lawn green.
 */
const CAMPUS_LAMP = theme("campus-lamp", {
  "stone.bright": "gold.pale",
  "stone.pale": "stone.pale",
  "stone.light": "stone.lamp",
  "stone.mid": "stone.vein",
  "stone.dark": "stone.mid",
  "grass.bright": "grass.pale",
  "grass.pale": "grass.light",
  "grass.light": "grass.soft",
  "grass.soft": "grass.mid",
});

/** The lamp's middle band, and the bright foot of a window's spill: warm greys on stone. */
const CAMPUS_DUSK = theme("campus-dusk", {
  "ink.mid": "ink.dark",
  "stone.bright": "stone.lamp",
  "stone.pale": "stone.lamp",
  "stone.light": "stone.vein",
  "stone.lamp": "stone.vein",
  "stone.mid": "stone.dark",
  "stone.vein": "stone.dark",
  "stone.dark": "ink.mid",
  "grass.bright": "grass.soft",
  "grass.pale": "grass.soft",
  "grass.light": "grass.mid",
  "grass.soft": "grass.mid",
  "grass.mid": "board.mid",
  "board.light": "board.mid",
  "board.mid": "board.dark",
  "board.dark": "board.deep",
  "wood.pale": "wood.light",
  "wood.light": "wood.mid",
  "wood.mid": "wood.dark",
  "clay.pale": "clay.dust",
  "clay.dust": "clay.light",
  "clay.light": "clay.mid",
  "clay.mid": "clay.dark",
  "red.light": "red.mid",
  "red.mid": "red.dark",
  "navy.light": "navy.mid",
  "navy.mid": "navy.dark",
});

/**
 * The last of any light before the night: the night itself with stone and grass one step up,
 * so a pool or a spill fades out instead of ending on an edge.
 */
const CAMPUS_GLOW = theme("campus-glow", {
  ...CAMPUS_NIGHT.remap,
  "stone.bright": "stone.mid",
  "stone.pale": "stone.dark",
  "stone.lamp": "stone.dark",
  "stone.light": "stone.dark",
  "stone.vein": "ink.mid",
  "stone.mid": "ink.mid",
  "stone.dark": "ink.dark",
  "grass.bright": "board.light",
  "grass.pale": "board.light",
  "grass.light": "board.mid",
  "grass.soft": "board.mid",
  "grass.mid": "board.dark",
});

/**
 * The field at night: the campus night, with the open field's sand carried by its grain. Every
 * grain is lit a step above the ground and shaded a step below it, and the warm grains turn
 * umber, so the field reads as earth.
 */
const FIELD_NIGHT = theme("field-night", {
  ...CAMPUS_NIGHT.remap,
  "stone.bright": "stone.dark",
  "stone.pale": "ink.mid",
  "stone.light": "stone.dark",
  "stone.mid": "ink.dark",
  "stone.vein": "ink.dark",
  "stone.dark": "ink.deep",
  "clay.pale": "wood.dark",
});

/**
 * Daylight pouring out of a rift across a campus at night, in three bands from the tear out:
 * the field's pale sand takes the sunlit dust tone, then falls through the wood ramp to the
 * night. White stays white in the first band, so the torn paper edge always reads.
 */
const RIFT_SUN = theme("rift-sun", {
  "stone.pale": "clay.dust",
  "stone.lamp": "clay.dust",
  "stone.light": "wood.pale",
  "stone.mid": "wood.light",
  "stone.vein": "wood.light",
  "stone.dark": "wood.mid",
});

const RIFT_WARM = theme("rift-warm", {
  "stone.bright": "clay.dust",
  "stone.pale": "wood.pale",
  "stone.lamp": "wood.pale",
  "stone.light": "wood.light",
  "stone.mid": "wood.mid",
  "stone.vein": "wood.mid",
  "stone.dark": "wood.dark",
  "grass.bright": "grass.pale",
  "grass.pale": "grass.light",
  "grass.light": "grass.soft",
  "grass.soft": "grass.mid",
  "grass.mid": "board.mid",
  "wood.pale": "wood.light",
  "wood.light": "wood.mid",
  "wood.mid": "wood.dark",
});

const RIFT_EMBER = theme("rift-ember", {
  "stone.bright": "wood.pale",
  "stone.pale": "wood.light",
  "stone.lamp": "wood.light",
  "stone.light": "wood.mid",
  "stone.mid": "wood.dark",
  "stone.vein": "wood.dark",
  "stone.dark": "wood.deep",
  "grass.bright": "grass.soft",
  "grass.pale": "grass.soft",
  "grass.light": "grass.mid",
  "grass.soft": "board.mid",
  "grass.mid": "grass.deep",
  "wood.pale": "wood.mid",
  "wood.light": "wood.dark",
  "wood.mid": "wood.deep",
  "ink.mid": "ink.dark",
});

/**
 * Campus at 16:50, the sun low in the west: whites and highlights turn to gold, pale stone and
 * dust warm up, and lawn tips catch the light. Mid and dark steps stay, so shadows keep their
 * cool and the long shadows of the buildings read against warm ground.
 */
const CAMPUS_GOLDEN = theme("campus-golden", {
  "stone.bright": "gold.pale",
  "stone.pale": "clay.pale",
  "stone.lamp": "clay.dust",
  "stone.light": "stone.lamp",
  "stone.vein": "stone.mid",
  "stone.mid": "stone.vein",
  "grass.bright": "gold.pale",
  "grass.pale": "grass.bright",
  "grass.soft": "grass.light",
  "wood.pale": "clay.pale",
  "wood.light": "clay.dust",
  "clay.pale": "gold.pale",
  "olive.light": "gold.light",
  "navy.pale": "rose.pale",
});

/**
 * Sun let through a gap between buildings onto golden ground, in two bands: the core turns lawn
 * and stone a step brighter and warmer, the rim one step.
 */
const GOLDEN_SUN = theme("golden-sun", {
  ...CAMPUS_GOLDEN.remap,
  "stone.pale": "gold.pale",
  "stone.light": "stone.lamp",
  "stone.mid": "stone.vein",
  "grass.light": "grass.pale",
  "grass.soft": "grass.light",
  "grass.mid": "grass.soft",
  "wood.pale": "clay.pale",
  "wood.light": "clay.dust",
});

const GOLDEN_WARM = theme("golden-warm", {
  ...CAMPUS_GOLDEN.remap,
  "stone.light": "stone.lamp",
  "grass.light": "grass.soft",
  "grass.mid": "grass.mid",
  "wood.pale": "clay.dust",
  "wood.light": "clay.light",
});

/**
 * Shade at golden hour: what the low sun does not reach turns cool and a step or two darker,
 * lawn to teal, warm stone to violet grey, dust to umber.
 */
const GOLDEN_SHADE = theme("golden-shade", {
  "stone.bright": "stone.light",
  "stone.pale": "stone.mid",
  "stone.lamp": "stone.mid",
  "stone.light": "stone.vein",
  "stone.vein": "stone.dark",
  "stone.mid": "stone.dark",
  "stone.dark": "ink.mid",
  "grass.bright": "grass.light",
  "grass.pale": "grass.soft",
  "grass.light": "board.light",
  "grass.soft": "board.light",
  "grass.mid": "board.mid",
  "wood.pale": "wood.light",
  "wood.light": "wood.mid",
  "wood.mid": "wood.dark",
  "clay.pale": "wood.light",
  "clay.light": "clay.mid",
  "gold.pale": "stone.light",
  "gold.light": "gold.mid",
});

/** Page 1, Greece: the lawn dries to olive grass and the earth to warm, sunlit dust. */
const GREECE = theme("greece", {
  "grass.bright": "stone.bright",
  "grass.pale": "gold.pale",
  "grass.light": "olive.light",
  "grass.mid": "olive.mid",
  "grass.dark": "olive.dark",
  "grass.deep": "olive.deep",
  "grass.soft": "olive.mid",
  "wood.pale": "clay.pale",
  "wood.light": "clay.dust",
  "wood.mid": "clay.light",
  "wood.dark": "clay.mid",
  "clay.pale": "gold.pale",
});

/** Every theme baked by the compiler. Each Page adds one; campus also has a night version. */
export const THEMES: readonly Theme[] = [
  theme("campus", {}),
  CAMPUS_NIGHT,
  CAMPUS_LAMP,
  CAMPUS_DUSK,
  CAMPUS_GLOW,
  FIELD_NIGHT,
  RIFT_SUN,
  RIFT_WARM,
  RIFT_EMBER,
  GREECE,
  CAMPUS_GOLDEN,
  GOLDEN_SUN,
  GOLDEN_WARM,
  GOLDEN_SHADE,
];

/** Readable name of an index for error messages, like `red.deep` or `hair.mid`. */
export function nameOf(index: number): string {
  const slot = slotOf(index);
  if (slot) return `${slot.name}.${SLOT_STEPS[index - slot.base]}`;
  const names = RAMP_LIST.flatMap((r) =>
    rampEntries(r)
      .filter(([, i]) => i === index)
      .map(([step]) => `${r.name}.${step}`),
  );
  return names.length > 0 ? names.join(" / ") : `#${index}`;
}
