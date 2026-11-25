import { body, mask, over } from "../../draw.ts";
import { type Legend, sprite } from "../../format.ts";
import { clean, Pic } from "../../fx.ts";

/**
 * Status markers: 9×9 badges that sit above a monster's head, one shape and one colour each, so
 * a row of them reads at ×1 without text. They belong to the status, not to the class that
 * applied it: fire is orange whoever lit it. Each bobs a pixel on its own beat.
 */
const STATUS: Legend = {
  ".": null,
  W: "stone.bright",
  K: "ink.deep",
  // Amber: 가연.
  "1": "gold.deep",
  "2": "gold.dark",
  "3": "gold.mid",
  "4": "gold.light",
  "5": "gold.pale",
  // Orange: 불.
  "6": "clay.dark",
  "7": "clay.mid",
  "8": "clay.light",
  // Lime: 산.
  a: "grass.deep",
  b: "grass.mid",
  c: "grass.light",
  d: "grass.pale",
  e: "grass.bright",
  // Violet: 염기.
  f: "plum.dark",
  g: "plum.mid",
  h: "plum.light",
  i: "plum.pale",
  // Grey: 금속.
  j: "stone.deep",
  k: "stone.dark",
  l: "stone.mid",
  m: "stone.light",
  n: "stone.pale",
  // Blue: 수분 and the shield.
  o: "navy.deep",
  p: "navy.dark",
  q: "navy.mid",
  r: "navy.light",
  s: "navy.pale",
  // Rose: 출혈.
  t: "rose.dark",
  u: "rose.mid",
  v: "rose.light",
  // Wood: the snail's shell.
  x: "wood.deep",
  y: "wood.mid",
  z: "wood.light",
  Z: "wood.pale",
  // Lone glints and bubbles.
  "*": "stone.bright",
  "!": "grass.bright",
  "?": "grass.pale",
  "^": "rose.light",
};
const LONE = "*!?^";

const S = 9;
const solid = (m: string, line: string, light: string, mid: string, dark: string) =>
  body(S, S, mask(m), { line, light, mid, dark });

const FLAME = `
  ....#....
  ....##...
  ...###...
  ..####...
  .######..
  .#######.
  .#######.
  ..#####..
  ...###...
`;
const PUDDLE = `
  .........
  .........
  .........
  .........
  ..#####..
  .#######.
  #########
  .#######.
  ..#####..
`;
const BUBBLE = `
  .........
  ..#####..
  .#######.
  #########
  #########
  #########
  #########
  .#######.
  ..#####..
`;
const INGOT = `
  .........
  .........
  ..#####..
  .#######.
  #########
  #########
  #########
  .........
  .........
`;
const DROP = `
  ....#....
  ...###...
  ...###...
  ..#####..
  .#######.
  .#######.
  .#######.
  ..#####..
  ...###...
`;
const BLOOD = `
  ..#......
  .###.....
  .###.....
  #####....
  #####..#.
  #####.###
  .###..###
  .......#.
  .........
`;
const SHIELD = `
  .#######.
  #########
  #########
  #########
  #########
  .#######.
  ..#####..
  ...###...
  ....#....
`;

const STAR = `
  ....#....
  ...###...
  ...###...
  #########
  .#######.
  ..#####..
  ..##.##..
  .##...##.
  .#.....#.
`;

const ICONS: Record<string, string> = {
  /** 가연: a white hazard diamond with an amber rim and a flame in it. */
  flammable: `
    ....1....
    ...131...
    ..13W31..
    .13W7W31.
    13W787W31
    .13W8W31.
    ..13W31..
    ...131...
    ....1....
  `,
  /** 불: a flame with a pale heart. */
  burn: over(
    solid(FLAME, "6", "4", "8", "7"),
    `
      .........
      .........
      .........
      .........
      .........
      ....5....
      ...55....
      .........
      .........
    `,
  ),
  /** 산: a lime puddle with bubbles fizzing off it. */
  acid: over(
    solid(PUDDLE, "a", "e", "d", "c"),
    `
      ......!..
      ..?......
      .....?...
      ...!.....
      .........
      .........
      .........
      .........
      .........
    `,
  ),
  /** 염기: a slippery violet bubble with a window glint. */
  base: over(
    solid(BUBBLE, "f", "i", "h", "g"),
    `
      .........
      .........
      ..**.....
      ..*......
      .........
      .........
      .........
      .........
      .........
    `,
  ),
  /** 금속: a bright ingot. */
  metal: over(
    solid(INGOT, "j", "n", "m", "l"),
    `
      .........
      .........
      .........
      ...**....
      .........
      .........
      .........
      .........
      .........
    `,
  ),
  /** 수분: a water drop. */
  wet: over(
    solid(DROP, "o", "s", "r", "q"),
    `
      .........
      .........
      .........
      ...*.....
      ...*.....
      .........
      .........
      .........
      .........
    `,
  ),
  /** 출혈: a drop with a smaller one falling after it. */
  bleed: solid(BLOOD, "t", "v", "u", "u"),
  /** 둔화: a snail, in no hurry: spiral shell, pale body, eye stalks up. */
  slow: `
    .........
    .x..xxxx.
    .x.xzZZzx
    xmxzyxxZx
    xmxzxyxzx
    xmxzyyyzx
    xmmxxxxxx
    .xmmmmmmx
    ..xxxxxxx
  `,
  /** 나트륨: a soft grey lump of sodium, cut to show the bright metal inside. */
  sodium: `
    .........
    .........
    ..jjjjj..
    .jkkkkkj.
    jkkmnnmkj
    jkmnWnmlj
    jkkmmmllj
    .jkllllj.
    ..jjjjj..
  `,
  /** 감염: a spiked capsid, the green of something catching. */
  infection: `
    ....a....
    .a..d..a.
    ..adcda..
    .adccbda.
    adcceccda
    .adccbda.
    ..adbda..
    .a..d..a.
    ....a....
  `,
  /** 증명: the tombstone that ends a proof. */
  proof: `
    .........
    .ooooooo.
    .osssrro.
    .osrrrqo.
    .osrrrqo.
    .orrrqqo.
    .orqqqqo.
    .ooooooo.
    .........
  `,
  /** 보호막: a whole white shield, the player's. */
  shield: over(
    solid(SHIELD, "j", "n", "m", "l"),
    `
      .........
      .**......
      .*.......
      .........
      .........
      .........
      .........
      .........
      .........
    `,
  ),
  /** 무적: a gold star. */
  invulnerable: solid(STAR, "1", "5", "4", "3"),
  /** 유전 표지: the pedigree's filled square and its line of descent. */
  mark: `
    .aaaaaa..
    .acccca..
    .acddca..
    .acddca..
    .acccca..
    .aaaaaa..
    ...aa....
    ...aa....
    .........
  `,
  /** 방어 감소: a shield split by a crack. */
  "armor-break": over(
    solid(SHIELD, "o", "s", "r", "q"),
    `
      .........
      ....K....
      ....K....
      ...K.....
      ...KK....
      ....K....
      .........
      .........
      .........
    `,
  ),
};

/** Each badge, then the same badge a pixel higher: the bob. */
const frames: Record<string, string> = {};
const anim: Record<string, { frames: string[]; fps: number; jump: number }> = {};
Object.entries(ICONS).forEach(([name, grid], i) => {
  const icon = clean(Pic.of(grid), LONE);
  frames[`${name}0`] = Pic.blank(S, S + 1)
    .put(icon, 0, 1)
    .toString();
  frames[`${name}1`] = Pic.blank(S, S + 1)
    .put(icon, 0, 0)
    .toString();
  const beat = i % 3;
  anim[name] = {
    frames: [`${name}0`, `${name}0`, `${name}1`, `${name}1`].map((_, k) =>
      (k + beat) % 4 < 2 ? `${name}0` : `${name}1`,
    ),
    fps: 4,
    jump: 0.2,
  };
});

const status = sprite({
  name: "status",
  group: "combat",
  outline: false,
  palette: STATUS,
  lone: LONE,
  size: [S, S + 1],
  origin: [4, S],
  frames,
  anim,
});

export default [status];
