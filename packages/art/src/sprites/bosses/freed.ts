import { type Legend, type PartDef, type Piece, part, type RigDef, rig } from "../../format.ts";
import { DEEP_INDICES, nameOf, rampsOf, SLOT_STEPS, slotOf } from "../../palette.ts";
import { CLEAR } from "../../raster.ts";
import { compileRig } from "../../rig.ts";
import { frame, garment, ink, lone, shadow, skin, walkArms } from "../characters/student.ts";
import { clean, Pic, seal } from "./kit.ts";

/** Folds stray single pixels of a hand-typed piece into their neighbours. */
const tidy = (g: string): string => clean(Pic.of(g), `${lone}.`, "XGOKETWNDR").toString();

/**
 * After freedom: Page 1's freed minds and its ally walking the campus, on the student rig (16×24
 * in a 24×26 frame, down, up and side), each with a quirk that plays now and then.
 *
 * - `aristotle-campus`: 방과후 강사. Plum himation over linen, a school lanyard he wears with
 *   pride, a wax tablet always in hand. Quirk `jot`: he looks down and writes another category.
 * - `zeno-campus`: hands folded in his sea-blue sleeves, unhurried. Quirk `half`: half a step,
 *   then a small polite bow, as if checking that arriving still works.
 * - `pythagorean-campus`: the one who said 나는 first, white linen and fillet. Quirk `count`: a
 *   hand comes up and counts.
 * - `aristarchus-campus`: the one who was right. A sun hat, an ochre traveller's chiton and his
 *   measuring stick. Quirk `squint`: a hand to the brim, eyes on the sun.
 *
 * Each is drawn in the student's layers (robe, feet, face, hair, accessory, held item) and then
 * baked: every direction and frame is composited into one `body` piece and cleaned of the stray
 * pixels layers leave where they overlap, so the published rig has a `shadow` layer and a `body`
 * layer, one part each, and the same frame and animation names.
 */

/** Sandalled feet under a robe, on the student's leg bones. */
const sandal = {
  rest: `
    ....
    ....
    ....
    ....
    OssO
    OOOO
  `,
  lift: `
    ....
    ....
    ....
    OssO
    OOOO
  `,
};
const sandalSide = {
  rest: `
    ........
    ........
    ........
    ........
    ..OsssO.
    ..OOOOO.
  `,
  fwd: `
    ........
    ........
    ........
    ........
    ...OsssO
    ...OOOOO
  `,
  back: `
    ........
    ........
    ........
    ........
    .OsssO..
    .OOOOO..
  `,
};
const feet = part({
  palette: ink,
  pieces: {
    legR: {
      at: { down: [8, 19], up: [12, 19], side: [8, 19] },
      down: sandal,
      up: sandal,
      side: sandalSide,
    },
    legL: {
      at: { down: [12, 19], up: [8, 19], side: [8, 19] },
      down: sandal,
      up: sandal,
      side: sandalSide,
    },
  },
});

/** Short linen sleeves, bare forearms. */
const LINEN_SLEEVE: Legend = {
  "1": "stone.deep",
  "2": "stone.bright",
  "3": "stone.light",
  "4": "skin.deep",
  "5": "skin.light",
  "6": "skin.mid",
};
const ROBE_INK: Legend = {
  K: "plum.deep",
  P: "plum.dark",
  Q: "plum.mid",
  Y: "plum.light",
  A: "gold.light",
  E: "sea.deep",
  F: "sea.dark",
  B: "sea.mid",
  Z: "sea.light",
};
const robe = (
  torso: Record<"down" | "up" | "side", string>,
  sleeve: Legend = LINEN_SLEEVE,
): PartDef =>
  garment(
    { ...sleeve, ...ROBE_INK },
    { down: tidy(torso.down), up: tidy(torso.up), side: tidy(torso.side) },
    false,
  );

const himation = robe({
  down: `
    GwwKQYPK
    GwKQYQPK
    GKAQQQPK
    KAQYQQPK
    KQQYQPPK
    KQQQQPPK
    KQQQQPPK
    KAaaaaDK
    GpppppqG
    GGGGGGGG
  `,
  up: `
    KYQQQPPK
    KYQQQPPK
    KQYQQPPK
    KQQYQPPK
    KQQQYPPK
    KQQQQPPK
    KQQQQPPK
    KAaaaaDK
    GpppppqG
    GGGGGGGG
  `,
  side: `
    KKQQPK
    KYQQPK
    KYAQPK
    KYQAPK
    KQQQPK
    KQQQPK
    KQQQPK
    KAaaDK
    GppppG
    GGGGGG
  `,
});

const seaRobe = robe({
  down: `
    GwwEBZFE
    GwEBZBFE
    GEZBBBFE
    EZBBBBFE
    EBBBBFFE
    EBBBBFFE
    EBBBBFFE
    EZZZZZZE
    EBBBBFFE
    EEEEEEEE
  `,
  up: `
    EZBBBFFE
    EZBBBFFE
    EBZBBFFE
    EBBZBFFE
    EBBBZFFE
    EBBBBFFE
    EBBBBFFE
    EZZZZZZE
    EBBBBFFE
    EEEEEEEE
  `,
  side: `
    EEBBFE
    EZBBFE
    EZBBFE
    EZBBFE
    EBBBFE
    EBBBFE
    EBBBFE
    EZZZZE
    EBBBFE
    EEEEEE
  `,
});

const whiteRobe = robe({
  down: `
    GwwppqqG
    GwwpgqqG
    GwpgqqqG
    GwpgqqqG
    GwppqqqG
    GwppqqgG
    GwppqqgG
    GwppqqgG
    GaaaaaDG
    GGGGGGGG
  `,
  up: `
    GwppqqqG
    GwppqqqG
    GwppqqqG
    GwppqqgG
    GwppqqgG
    GwppqqgG
    GwppqqgG
    GwppqqgG
    GaaaaaDG
    GGGGGGGG
  `,
  side: `
    GGwqqG
    GwpqqG
    GwpqqG
    GwpqgG
    GwpqgG
    GwpqgG
    GwpqgG
    GwpqgG
    GaaaDG
    GGGGGG
  `,
});

/** A knee-length ochre chiton belted with a cord, for walking out to measure shadows. */
const ochre = robe(
  {
    down: `
      TUUuuutT
      TUuuuutT
      TUuuuutT
      TWWWWWWT
      TUuuuutT
      TUuuuttT
      TUuuuttT
      TyyyyyyT
      TTTTTTTT
      ........
    `,
    up: `
      TUuuuutT
      TUuuuutT
      TUuuuutT
      TWWWWWWT
      TUuuuutT
      TUuuuttT
      TUuuuttT
      TyyyyyyT
      TTTTTTTT
      ........
    `,
    side: `
      TTUuuT
      TUuutT
      TUuutT
      TWWWWT
      TUuutT
      TUuutT
      TUuutT
      TyyyyT
      TTTTTT
      ......
    `,
  },
  { ...LINEN_SLEEVE, "1": "clay.deep", "2": "clay.light", "3": "clay.mid" },
);
/** Bare shins under the short chiton. */
const shins = part({
  palette: ink,
  pieces: {
    legR: {
      at: { down: [8, 19], up: [12, 19], side: [8, 19] },
      down: { rest: ".OsO\n.OsO\n.OsO\n.OsO\nOssO\nOOOO", lift: ".OsO\n.OsO\n.OsO\nOssO\nOOOO" },
      up: { rest: ".OsO\n.OsO\n.OsO\n.OsO\nOssO\nOOOO", lift: ".OsO\n.OsO\n.OsO\nOssO\nOOOO" },
      side: {
        rest: "..OssO..\n..OssO..\n..OssO..\n..OssO..\n..OsssO.\n..OOOOO.",
        fwd: "..OssO..\n..OssO..\n...OssO.\n...OssO.\n...OsssO\n...OOOOO",
        back: "..OssO..\n..OssO..\n.OssO...\n.OssO...\nOsssO...\nOOOOO...",
      },
    },
    legL: {
      at: { down: [12, 19], up: [8, 19], side: [8, 19] },
      down: { rest: "OsO.\nOsO.\nOsO.\nOsO.\nOssO\nOOOO", lift: "OsO.\nOsO.\nOsO.\nOssO\nOOOO" },
      up: { rest: "OsO.\nOsO.\nOsO.\nOsO.\nOssO\nOOOO", lift: "OsO.\nOsO.\nOsO.\nOssO\nOOOO" },
      side: {
        rest: "..OkkO..\n..OkkO..\n..OkkO..\n..OkkO..\n..OkkkO.\n..OOOOO.",
        fwd: "..OkkO..\n..OkkO..\n...OkkO.\n...OkkO.\n...OkkkO\n...OOOOO",
        back: "..OkkO..\n..OkkO..\n.OkkO...\n.OkkO...\nOkkkO...\nOOOOO...",
      },
    },
  },
});

// Hair, beards and hats --------------------------------------------------------------------------

const GREY: Legend = {
  ...ink,
  X: "ink.deep",
  x: "ink.mid",
  h: "stone.dark",
  H: "stone.mid",
  g: "stone.light",
};
const DARK: Legend = { ...ink, X: "ink.deep", x: "ink.dark", h: "ink.mid", H: "ink.light" };
const BROWN: Legend = { ...ink, X: "wood.deep", x: "wood.dark", h: "wood.mid", H: "wood.light" };

const hairPart = (palette: Legend, head: Piece & Record<"down" | "up" | "side", string>): PartDef =>
  part({
    palette,
    lone,
    pieces: { head: { ...head, down: tidy(head.down), up: tidy(head.up), side: tidy(head.side) } },
  });

/** Steel-grey curls receding at the temples and a square beard. */
const aristotleHair = hairPart(GREY, {
  at: { down: [4, 1], up: [4, 1], side: [0, 1] },
  down: `
    ....XXXXXXXX....
    ..XXhHHhhHHhXX..
    .XhHhX....XhhhX.
    XhHhX......XhhhX
    XhhX........XhxX
    XhX..........XxX
    XhX..........XxX
    .X............X.
    ................
    ...X........X...
    ..XhhxxxxxxhhX..
    ..XhHhhhhhhhhX..
    ...XhHhhhhhhX...
    ....XhhhhhhX....
    .....XXXXXX.....
  `,
  up: `
    ....XXXXXXXX....
    ..XXhHHhhHHhXX..
    .XhHHhhhHHhhhhX.
    XhHhhhhhhhhhhhxX
    XhhhhHHhhhhhhhxX
    XhhhhhhhhhHHhxxX
    XhhhhhhhhhhhhxxX
    XhhHHhhhhhhhhxxX
    XhhhhhhhhhhhhxxX
    .XhhhhhhhhhhhxX.
    ..XhhhhhhhhhxX..
    ....XXXXXXXX....
  `,
  side: `
    ........XXXXXX......
    ......XXhHHhhhX.....
    .....XhHhhhhhhhX....
    .....XhhX....hhhX...
    .....XhX......XhxX..
    .....XhX.......XxX..
    .....XhhX...........
    .....XhhX...........
    .....XhhX....XXXX...
    ......XhX...XhhhhX..
    .......X....XhHhhX..
    ............XhhhX...
    .............XXX....
  `,
});

/** Short dark curls and a trimmed beard. */
const zenoHair = hairPart(DARK, {
  at: { down: [4, 1], up: [4, 1], side: [0, 1] },
  down: `
    .....XXXXXX.....
    ...XXhHhhHhXX...
    ..XhHhhxhhhhhX..
    .XhhxhhhhxhhhxX.
    XhhhxXXXXXhxhhxX
    XhX..........XxX
    XhX..........XxX
    .X............X.
    ................
    ................
    ..XxX......XxX..
    ...XxxxxxxxxX...
    ....XXXXXXXX....
  `,
  up: `
    .....XXXXXX.....
    ...XXhHHhhhXX...
    ..XhHHhxxhhhhX..
    .XhhxxhhhhxxhxX.
    XhhhhhhxxhhhhhxX
    XhxxhhhhhhxxhhxX
    XhhhhxxhhhhhhxxX
    XhhhhhhhhxxhhxxX
    XhhhhhhhhhhhhxxX
    .XhhhhhhhhhhhxX.
    ..XhhhhhhhhhxX..
    ....XXXXXXXX....
  `,
  side: `
    ........XXXXX.......
    ......XXhHhhhX......
    .....XhHhxhhhhX.....
    .....XhhhhXXhhhX....
    .....XhxX....XhxX...
    .....XhhX...........
    .....XhhX...........
    .....XhhX...........
    ......XhX....XXX....
    .......X....XxxxX...
    ............XxxxX...
    .............XXX....
  `,
});

/** Long black hair tied back, the white fillet of the school. */
const pythagoreanHair = hairPart(DARK, {
  at: { down: [4, 1], up: [4, 1], side: [0, 1] },
  down: `
    .....XXXXXX.....
    ...XXhHHhhhXX...
    ..XhHhhhhhhhhX..
    .XhHhhhhhhhhhxX.
    XGwwppppppppqqGX
    XhX..........XxX
    XhX..........XxX
    XhX..........XxX
    XhX..........XxX
    .X............X.
  `,
  up: `
    .....XXXXXX.....
    ...XXhHHhhhXX...
    ..XhHhhhhhhhhX..
    .XhHhhhhhhhhhxX.
    XGwwppppppppqqGX
    XhhhhhhhhhhhhxxX
    XhhhhhhhhhhhhxxX
    XhhhhhhhhhhhhxxX
    XhhhhhhhhhhhhxxX
    .XhhhhhhhhhhxxX.
    ..XhhhhhhhhhxX..
    ....XhhhhhhX....
    .....XhhhhX.....
    ......XhhX......
    .......XX.......
  `,
  side: `
    ........XXXXX.......
    ......XXhHHhhX......
    .....XhHhhhhhhX.....
    .....XhhhhhhhhhX....
    ....GwwppppppqqG....
    ...XhhX.............
    ..XhhhX.............
    ..XhhX..............
    ..XhhX..............
    ...XhX..............
    ....X...............
  `,
});

/** Sun-bleached brown hair under a wide traveller's hat. */
const aristarchusHair = hairPart(
  { ...BROWN, T: "clay.deep", t: "clay.dark", u: "clay.mid", U: "clay.light", y: "clay.pale" },
  {
    at: { down: [2, 0], up: [2, 0], side: [-1, 1] },
    down: `
      ....TTTTTTTTTTTT....
      ....TUyyUUUUuutT....
      TTTTTUUUUUUuuuutTTTT
      TUyyyyUUUUUUUuuuuutT
      .TTTTTTTTTTTTTTTTTT.
      ..XhhX........XhhX..
      ..XhX..........XhX..
      ..XhX..........XxX..
      ...X............X...
    `,
    up: `
      ....TTTTTTTTTTTT....
      ....TUyyUUUUuutT....
      TTTTTUUUUUUuuuutTTTT
      TUyyyyUUUUUUUuuuuutT
      .TTTTTTTTTTTTTTTTTT.
      ..XhHhhhhhhhhhhhxX..
      ..XhhhhhhhhhhhhhxX..
      ...XhhhhhhhhhhhxX...
      ....XXXXXXXXXXXX....
    `,
    side: `
      ......TTTTTTTTT.........
      ......TUyyUUUuutT.......
      ..TTTTUUUUUUuuuutTTTTT..
      ..TUyyyUUUUUUuuuuuuutT..
      ...TTTTTTTTTTTTTTTTTT...
      ......XhhhhhhX..........
      ......XhhhX.............
      ......XhhhX.............
      .......XhX..............
    `,
  },
);

// Faces ---------------------------------------------------------------------------------------

const facePart = (down: Record<string, string>, side: Record<string, string>): PartDef =>
  part({
    palette: ink,
    lone,
    pieces: { head: { at: { down: [5, 8], up: [5, 8], side: [3, 8] }, down, up: null, side } },
  });

const aristotleFace = facePart(
  {
    rest: `
      ..**......**..
      ...*^....^*...
    `,
    look: `
      ..............
      ...**....**...
    `,
  },
  {
    rest: `
      ...........**..
      ...........*^..
    `,
    look: `
      ...............
      ...........**..
    `,
  },
);
const zenoFace = facePart(
  {
    rest: `
      ...**....**...
      ...*^....^*...
      ..............
      ......--......
    `,
    bow: `
      ..............
      ...--....--...
      ..............
      ......--......
    `,
  },
  {
    rest: `
      ...........**..
      ...........*^..
      ...............
      .............-.
    `,
    bow: `
      ...............
      ...........--..
      ...............
      .............-.
    `,
  },
);
const pythagoreanFace = facePart(
  {
    rest: `
      ...**....**...
      ...*^....^*...
      ..............
      ......--......
    `,
    count: `
      ...**....**...
      ...**....**...
      ..............
      ......'.......
    `,
  },
  {
    rest: `
      ...........**..
      ...........*^..
      ...............
      .............-.
    `,
    count: `
      ...........**..
      ...........**..
      ...............
      .............'.
    `,
  },
);
const aristarchusFace = facePart(
  {
    rest: `
      ...**....**...
      ...*^....^*...
      ..'........'..
      ......--......
    `,
    squint: `
      ..............
      ..---....---..
      ..'........'..
      .....----.....
    `,
  },
  {
    rest: `
      ...........**..
      ...........*^..
      ..........'....
      .............-.
    `,
    squint: `
      ...............
      ..........---..
      ..........'....
      ............--.
    `,
  },
);

// Accessories and things in hand --------------------------------------------------------------

/** The 방과후 강사 lanyard, worn the way other men wear a gold chain. */
const lanyard = part({
  palette: ink,
  lone,
  pieces: {
    torso: {
      at: { down: [9, 14], up: [9, 14], side: [11, 14] },
      down: `
        m....m
        .m..m.
        ..GG..
        .GwwG.
        .GqqG.
        .GGGG.
      `,
      up: null,
      side: `
        m.
        m.
        GG
        GG
      `,
    },
  },
});

/** A wax tablet in a wooden frame, a stylus tucked in. */
const tablet = part({
  palette: ink,
  lone,
  pieces: {
    hand: {
      at: { down: [2, 16], up: [18, 17], side: [6, 17] },
      down: {
        rest: `
          WWWWW
          WzzzW
          WziiW
          WzzzW
          WWWWW
        `,
        write: {
          at: [8, 14],
          grid: `
            .....q.
            WWWWWq.
            WzzzWq.
            WziiW..
            WzzzW..
            WWWWW..
          `,
        },
      },
      up: "WWW\nWWW\nWWW",
      side: {
        rest: `
          WWW
          WzW
          WzW
          WWW
        `,
        write: {
          at: [10, 14],
          grid: `
            ...q
            WWWq
            WzW.
            WzW.
            WWW.
          `,
        },
      },
    },
  },
});

/** The measuring stick: a straight staff notched along its length. */
const gnomon = part({
  palette: ink,
  pieces: {
    hand: {
      at: { down: [1, 4], up: [19, 4], side: [5, 3] },
      down: `
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WWW
      `,
      up: `
        WWW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WUW
        WWW
      `,
      side: `
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WUW
        WUW
        WWW
        WWW
      `,
    },
  },
});

// Rigs -----------------------------------------------------------------------------------------

const base = {
  idle0: {},
  idle1: { torso: [0, 1], hand: [0, 1] },
  walk0: (d: "down" | "up" | "side") => walkArms(d, "R") as never,
  walk1: { torso: [0, -1], hand: [0, -1] },
  walk2: (d: "down" | "up" | "side") => walkArms(d, "L") as never,
  walk3: { torso: [0, -1], hand: [0, -1] },
} as const;
const walk = { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 };
const idle = { frames: ["idle0", "idle0", "idle1", "idle1"], fps: 2 };

const look = (name: string, parts: Record<string, string>, skinTone: string) => ({
  [name]: { parts: { shadow: "blob", body: "base", ...parts }, slots: { skin: skinTone } },
});

/** Composites a layered one-look rig into a two-layer rig: its shadow, and one cleaned body. */
function bake(def: RigDef): RigDef {
  const name = def.name as string;
  const compiled = compileRig(def, name, `bake ${name}`);
  const look = compiled.looks[0];
  if (!look) throw new Error(`${name}: no look to bake`);
  const pool = [..."ABCDEFHIJKLMNPQRSTUVWXYZabcdfghijkmnopqrstuvwxyz0123456789#$=?<>[]{}()|/"];
  const legend: Record<string, string | null> = { ".": null };
  const charOf = new Map<string, string>();
  const loneChars = new Set<string>();
  const paint = (index: number): string => {
    const slot = slotOf(index);
    if (slot) return `${slot.name}.${SLOT_STEPS[index - slot.base]}`;
    return (nameOf(index).split(" / ")[0] as string).trim();
  };
  const char = (index: number, alone: boolean): string => {
    const key = `${index}${alone ? "!" : ""}`;
    let ch = charOf.get(key);
    if (!ch) {
      ch = pool.shift() as string;
      charOf.set(key, ch);
      legend[ch] = paint(index);
      if (alone) loneChars.add(ch);
    }
    return ch;
  };
  const deepIndex = (index: number): number => {
    const slot = slotOf(index);
    if (slot) return slot.base;
    if (DEEP_INDICES.has(index)) return index;
    return (rampsOf(index)[0]?.indices[0] ?? index) as number;
  };
  const keep = () => [...loneChars].join("");
  const grids = new Map<string, string>();
  for (const [key, img] of look.checked) {
    const p = Pic.blank(img.w, img.h);
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++) {
        const i = y * img.w + x;
        const v = img.px[i] as number;
        if (v === CLEAR) continue;
        p.set(x, y, char(v, img.lone[i] === 1));
        char(deepIndex(v), false);
      }
    grids.set(key, p.toString());
  }
  const deepChars = [...charOf]
    .filter(([k]) => !k.endsWith("!"))
    .map(([k, ch]) => {
      const v = Number(k);
      return [ch, deepIndex(v) === v] as const;
    });
  const deep = deepChars
    .filter(([, d]) => d)
    .map(([ch]) => ch)
    .join("");
  const deepOf = Object.fromEntries(
    [...charOf]
      .filter(([k]) => !k.endsWith("!"))
      .map(([k, ch]) => [ch, charOf.get(String(deepIndex(Number(k)))) as string]),
  );
  const cleaned = new Map<string, string>();
  for (const [key, g] of grids) {
    const once = clean(Pic.of(g), keep(), deep);
    cleaned.set(key, clean(seal(once, deepOf, keep()), keep(), deep).toString());
  }
  const poses = (dir: "down" | "up" | "side") =>
    Object.fromEntries([
      ["rest", cleaned.get(`${dir}/${compiled.frameNames[0]}`) as string],
      ...compiled.frameNames.map((f) => [f, cleaned.get(`${dir}/${f}`) as string]),
    ]);
  const body = part({
    palette: legend as Legend,
    lone: keep(),
    pieces: { torso: { at: [0, 0], down: poses("down"), up: poses("up"), side: poses("side") } },
  });
  const lookName = Object.keys(def.looks)[0] as string;
  return rig({
    name,
    size: def.size,
    origin: def.origin as Vec2,
    directions: def.directions,
    bones: { ground: null, torso: null },
    layers: ["shadow", "body"],
    unchecked: ["shadow"],
    parts: { shadow: { blob: shadow }, body: { [name]: body } },
    frames: Object.fromEntries(compiled.frameNames.map((f) => [f, { torso: f }])),
    anim: def.anim,
    looks: {
      [lookName]: {
        parts: { shadow: "blob", body: name },
        slots: def.looks[lookName]?.slots ?? {},
      },
    },
  });
}
type Vec2 = readonly [number, number];

export default [
  bake(
    rig({
      name: "aristotle-campus",
      ...frame,
      parts: {
        shadow: { blob: shadow },
        body: { base: skin },
        uniform: { himation },
        jacket: { feet },
        face: { aristotleFace },
        hair: { aristotleHair },
        accessory: { lanyard },
        book: { tablet },
      },
      frames: {
        ...base,
        jot0: { head: "look", hand: "write", armR: "read" },
        jot1: { head: ["look", 0, 1], hand: ["write", 1, 0], armR: "read", torso: [0, 1] },
      },
      anim: {
        idle,
        walk,
        jot: {
          frames: ["idle0", "jot0", "jot1", "jot0", "jot1", "jot0", "idle0"],
          fps: 4,
          loop: false,
        },
      },
      looks: look(
        "lecturer",
        {
          uniform: "himation",
          jacket: "feet",
          face: "aristotleFace",
          hair: "aristotleHair",
          accessory: "lanyard",
          book: "tablet",
        },
        "warm",
      ),
    }),
  ),
  bake(
    rig({
      name: "zeno-campus",
      ...frame,
      parts: {
        shadow: { blob: shadow },
        body: { base: skin },
        uniform: { seaRobe },
        jacket: { feet },
        face: { zenoFace },
        hair: { zenoHair },
      },
      frames: {
        ...base,
        half0: { legR: "lift" },
        bow0: { head: ["bow", 0, 1], torso: [0, 1] },
      },
      anim: {
        idle,
        walk,
        half: {
          frames: ["idle0", "half0", "half0", "idle0", "bow0", "bow0", "idle0"],
          fps: 4,
          loop: false,
        },
      },
      looks: look(
        "polite",
        { uniform: "seaRobe", jacket: "feet", face: "zenoFace", hair: "zenoHair" },
        "warm",
      ),
    }),
  ),
  bake(
    rig({
      name: "pythagorean-campus",
      ...frame,
      parts: {
        shadow: { blob: shadow },
        body: { base: skin },
        uniform: { whiteRobe },
        jacket: { feet },
        face: { pythagoreanFace },
        hair: { pythagoreanHair },
      },
      frames: {
        ...base,
        count0: { armR: "raise", head: "count" },
        count1: { armR: ["raise", 0, -1], head: "count" },
      },
      anim: {
        idle,
        walk,
        count: {
          frames: ["idle0", "count0", "count1", "count0", "count1", "idle0"],
          fps: 4,
          loop: false,
        },
      },
      looks: look(
        "first",
        { uniform: "whiteRobe", jacket: "feet", face: "pythagoreanFace", hair: "pythagoreanHair" },
        "deep",
      ),
    }),
  ),
  bake(
    rig({
      name: "aristarchus-campus",
      ...frame,
      parts: {
        shadow: { blob: shadow },
        body: { base: skin },
        uniform: { ochre },
        jacket: { shins },
        face: { aristarchusFace },
        hair: { aristarchusHair },
        book: { gnomon },
      },
      frames: {
        ...base,
        squint0: { armL: "raise", head: "squint" },
        squint1: { armL: "raise", head: ["squint", 0, -1] },
      },
      anim: {
        idle,
        walk,
        squint: {
          frames: ["idle0", "squint0", "squint1", "squint1", "squint0", "idle0"],
          fps: 3,
          loop: false,
        },
      },
      looks: look(
        "measuring",
        {
          uniform: "ochre",
          jacket: "shins",
          face: "aristarchusFace",
          hair: "aristarchusHair",
          book: "gnomon",
        },
        "fair",
      ),
    }),
  ),
];
