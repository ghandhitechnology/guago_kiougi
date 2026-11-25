/**
 * Authoring kit for Page 1's townspeople: Greek dress of the period on the student skeleton, so a
 * potter in the 아고라 has the same head, hands and face language as a student in the yard.
 * Dress is a chiton (short or to the ankle) or a woman's peplos in any colour, with a belt, an
 * optional himation drape, and short sleeves or none. Hair and hats are parts on the head bone.
 * Every figure is baked (`bosses/freed.ts`): composited per frame and cleaned of the stray pixels
 * overlapping layers leave, so it publishes as a shadow and one body.
 */
import type { Anim, FramePose, Legend, Look, Paint, PartDef, RigDef } from "./format.ts";
import { part, rig } from "./format.ts";
import { Pic } from "./paint.ts";
import { colorIndex, DEEP_INDICES, nameOf, rampsOf, slotOf } from "./palette.ts";
import { CLEAR } from "./raster.ts";
import { type CompiledRig, compileRig } from "./rig.ts";
import { bake, base, feet, shins } from "./sprites/bosses/freed.ts";
import { clean, seal } from "./sprites/bosses/kit.ts";
import { frame, garment, ink, lone, shadow, skin } from "./sprites/characters/student.ts";

export { bake, feet, shins };

type Ramp =
  | "red"
  | "clay"
  | "gold"
  | "wood"
  | "olive"
  | "grass"
  | "board"
  | "navy"
  | "sea"
  | "plum"
  | "rose"
  | "stone"
  | "ink";

/** Light, mid, shade and outline steps of a cloth ramp. */
function steps(ramp: Ramp): [Paint, Paint, Paint, Paint] {
  if (ramp === "stone") return ["stone.bright", "stone.pale", "stone.light", "stone.deep"];
  if (ramp === "ink") return ["ink.light", "ink.mid", "ink.dark", "ink.deep"];
  const at = (step: string) => `${ramp}.${step}` as Paint;
  return [at("light"), at("mid"), at("dark"), at("deep")];
}

const TORSO = {
  down: [
    "KYQQQQPK",
    "KYQQQQPK",
    "KYQQQQPK",
    "KAAAAAAK",
    "KYQPQQPK",
    "KYQPQQPK",
    "KYQPQQPK",
    "KYQPQPPK",
    "KYQPQPPK",
  ],
  up: [
    "KKKKKKKK",
    "KYQQQQPK",
    "KYQQQQPK",
    "KAAAAAAK",
    "KYQQQQPK",
    "KYQPQQPK",
    "KYQPQQPK",
    "KYQPQPPK",
    "KYQPQPPK",
  ],
  side: ["KYQQPK", "KYQQPK", "KYQQPK", "KAAAAK", "KYQQPK", "KYQPPK", "KYQPPK", "KYQPPK", "KYQPPK"],
} as const;

export interface DressSpec {
  /** Cloth colour. */
  readonly cloth: Ramp;
  /** Belt or girdle colour; defaults to the cloth's outline. */
  readonly belt?: string;
  /** `short` ends at the knee, `long` at the ankle, `kid` is a child's tunic. */
  readonly length: "short" | "long" | "kid";
  /** Sleeves: `short` cloth to the elbow, `bare` arms, `long` cloth to the wrist. */
  readonly sleeves?: "short" | "bare" | "long";
  /** A himation over the left shoulder and across the body, in its own colour. */
  readonly drape?: Ramp;
  /** An apron over the front (cooks, potters, fishmongers). */
  readonly apron?: Ramp;
}

/** Rows of the torso grid, the belt included, cut to the dress length and closed at the hem. */
function torso(rows: readonly string[], length: "short" | "long" | "kid", w: number): string[] {
  if (length === "kid") return [rows[0], rows[3], rows[4], "K".repeat(w)] as string[];
  const keep = length === "long" ? rows.length : 7;
  return [...rows.slice(0, keep), "K".repeat(w)];
}

function drapeOver(rows: string[], dir: "down" | "up" | "side"): string[] {
  return rows.map((r, y) => {
    if (y === rows.length - 1) return r;
    const cells = [...r];
    if (dir === "down") {
      // Over the left shoulder (the viewer's left) and down across to the right hip.
      for (const x of [y + 1, y + 2]) if (x > 0 && x < 7) cells[x] = x === y + 1 ? "Z" : "B";
    } else if (dir === "up") {
      for (const x of [6 - y, 5 - y]) if (x > 0 && x < 7) cells[x] = x === 6 - y ? "B" : "Z";
    } else if (y < 6) {
      cells[1] = "Z";
      cells[2] = "B";
    }
    return cells.join("");
  });
}

function apronOver(rows: string[], dir: "down" | "up" | "side"): string[] {
  if (dir === "up") return rows;
  return rows.map((r, y) => {
    if (y < 3 || y === rows.length - 1) return r;
    const cells = [...r];
    const span = dir === "down" ? [2, 3, 4, 5] : [3, 4];
    for (const x of span) cells[x] = y === 3 ? "N" : x === span[0] ? "V" : "n";
    return cells.join("");
  });
}

/** A chiton or peplos as a garment on the student's arms and torso, legs left to `feet`/`shins`. */
export function dress(spec: DressSpec): PartDef {
  const [light, mid, dark, deep] = steps(spec.cloth);
  const sleeve: Legend =
    spec.sleeves === "bare"
      ? {
          "1": "skin.deep",
          "2": "skin.light",
          "3": "skin.mid",
          "4": "skin.deep",
          "5": "skin.light",
          "6": "skin.mid",
        }
      : spec.sleeves === "long"
        ? { "1": deep, "2": light, "3": dark, "4": deep, "5": mid, "6": dark }
        : {
            "1": deep,
            "2": light,
            "3": dark,
            "4": "skin.deep",
            "5": "skin.light",
            "6": "skin.mid",
          };
  const legend: Legend = {
    ...sleeve,
    K: deep,
    P: dark,
    Q: mid,
    Y: light,
    A: (spec.belt as Paint | undefined) ?? deep,
  };
  if (spec.drape) {
    const [dl, dm] = steps(spec.drape);
    Object.assign(legend, { Z: dl, B: dm });
  }
  if (spec.apron) {
    const [al, am, , ad] = steps(spec.apron);
    Object.assign(legend, { V: al, n: am, N: ad });
  }
  const grid = (dir: "down" | "up" | "side") => {
    let rows = torso(TORSO[dir], spec.length, dir === "side" ? 6 : 8);
    if (spec.drape) rows = drapeOver(rows, dir);
    if (spec.apron) rows = apronOver(rows, dir);
    return rows.join("\n");
  };
  return garment(legend, { down: grid("down"), up: grid("up"), side: grid("side") }, false);
}

// Hair ------------------------------------------------------------------------------------------

const HAIR = {
  black: { X: "ink.deep", x: "ink.dark", h: "ink.mid", H: "ink.light" },
  brown: { X: "wood.deep", x: "wood.dark", h: "wood.mid", H: "wood.light" },
  auburn: { X: "clay.deep", x: "clay.dark", h: "clay.mid", H: "clay.light" },
  grey: { X: "ink.deep", x: "stone.dark", h: "stone.mid", H: "stone.light" },
  white: { X: "stone.deep", x: "stone.mid", h: "stone.light", H: "stone.pale" },
} as const;
export type HairColour = keyof typeof HAIR;

const hairPart = (colour: HairColour, pieces: PartDef["pieces"]): PartDef =>
  part({ palette: { ...ink, ...HAIR[colour] }, lone, pieces });

/** Short curls, a young man's or a working man's, no beard. */
export const curls = (c: HairColour) =>
  hairPart(c, {
    head: {
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
        ......XhX...........
        .......X............
      `,
    },
  });

/** Short curls and a trimmed beard. */
export const curlsBeard = (c: HairColour) =>
  hairPart(c, {
    head: {
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
    },
  });

/** Bald on top, a fringe round the back, and a long beard. */
export const baldBeard = (c: HairColour) =>
  hairPart(c, {
    head: {
      at: { down: [4, 1], up: [4, 1], side: [0, 1] },
      down: `
        ................
        ................
        ................
        ................
        XX............XX
        XhX..........XhX
        XhX..........XhX
        .X............X.
        ................
        ................
        ..XhhhhhhhhhhX..
        ..XhHhhhhhhhhX..
        ...XhhhhhhhhX...
        ....XhhhhhhX....
        .....XXXXXX.....
      `,
      up: `
        ................
        ................
        ................
        ................
        XX............XX
        XhX..........XhX
        XhhX........XhhX
        XhhhXXXXXXXXhhhX
        .XhhhhhhhhhhhhX.
        ..XhhhhhhhhhhX..
        ....XXXXXXXX....
      `,
      side: `
        ....................
        ....................
        ....................
        ....................
        ......X.............
        .....XhX............
        .....XhX............
        .....XhhX....XXXX...
        ......XhX...XhhhhX..
        .......X....XhHhhX..
        ............XhhhhX..
        .............XhhX...
        ..............XX....
      `,
    },
  });

/** A woman's hair parted in the middle and drawn back into a knot. */
export const knot = (c: HairColour) =>
  hairPart(c, {
    head: {
      at: { down: [4, 0], up: [4, 0], side: [0, 1] },
      down: `
        ......XXXX......
        .....XhHhxX.....
        ...XXXXXXXXXX...
        ..XHHhhhxhhhhX..
        .XHhhhhxhhhhhxX.
        XHhhhhxhhxhhhxxX
        XhhxXX....XXxhxX
        Xhx..........xhX
        XhX..........XxX
        .X............X.
      `,
      up: `
        ......XXXX......
        .....XhHhxX.....
        ...XXXhhhxXXX...
        ..XHHhhhhhhhhX..
        .XHhhhXXXXhhhxX.
        XHhhhXhHhxXhhxxX
        XhhhhXhhhxXhhxxX
        XhhhhhXXXXhhhxxX
        XhhhhhhhhhhhhxxX
        .XhhhhhhhhhhhxX.
        ..XhhhhhhhhhxX..
        ....XXXXXXXX....
      `,
      side: `
        .......XXXXX........
        .....XXHHhhhXX......
        ....XHHhhhhhhhX.....
        ...XHhhhhhhhhhhX....
        ..XXXhhhhhhhhxxX....
        .XhhXhhhhhhxx.......
        .XhxXhhhhhx.........
        ..XXXhhhh...........
        .....Xhhh...........
        ......XhhX..........
        .......XX...........
      `,
    },
  });

// Hats and head things ----------------------------------------------------------------------------

const HAT = (ramp: Ramp): Legend => {
  const [light, mid, dark, deep] = steps(ramp);
  return { ...ink, K: deep, P: dark, Q: mid, Y: light };
};

/** The pilos: a working man's felt cap. */
export const pilos = (ramp: Ramp) =>
  part({
    palette: HAT(ramp),
    pieces: {
      head: {
        at: { down: [7, 0], up: [7, 0], side: [4, 0] },
        down: `
          ....KK....
          ...KYQK...
          ..KYQQPK..
          .KYQQQPPK.
          KYYQQQQPPK
          KKKKKKKKKK
        `,
        up: `
          ....KK....
          ...KQQK...
          ..KYQQPK..
          .KYQQQPPK.
          KYQQQQQPPK
          KKKKKKKKKK
        `,
        side: `
          .....KK...
          ....KYQK..
          ...KYQQPK.
          ..KYQQQPPK
          .KYQQQQPPK
          KKKKKKKKKK
        `,
      },
    },
  });

/** The petasos: a traveller's wide felt hat. */
export const petasos = (ramp: Ramp) =>
  part({
    palette: HAT(ramp),
    pieces: {
      head: {
        at: { down: [3, 0], up: [3, 0], side: [0, 0] },
        down: `
          ......KKKKKK......
          ....KKYYQQQPKK....
          ...KYYQQQQQQPPK...
          KKKYQQQQQQQQPPPKKK
          KYYYQQQQQQQQQQPPPK
          .KKKKKKKKKKKKKKKK.
        `,
        up: `
          ......KKKKKK......
          ....KKYQQQQPKK....
          ...KYQQQQQQQPPK...
          KKKYQQQQQQQQPPPKKK
          KYYQQQQQQQQQQPPPPK
          .KKKKKKKKKKKKKKKK.
        `,
        side: `
          .......KKKKK........
          .....KKYYQQPKK......
          ....KYQQQQQQPPK.....
          .KKKYQQQQQQQQPPKKK..
          KYYYQQQQQQQQQQPPPPK.
          .KKKKKKKKKKKKKKKKK..
        `,
      },
    },
  });

/** A laurel wreath, the sophist's. */
export const wreath = part({
  palette: { ...ink, K: "grass.deep", Q: "grass.mid", Y: "grass.light" },
  pieces: {
    head: {
      at: { down: [4, 4], up: [4, 4], side: [4, 4] },
      down: `
        KYKKYKKYKKYKKYKK
        KQQKQQKQQKQQKQQK
      `,
      up: `
        KYKKYKKYKKYKKYKK
        KQQKQQKQQKQQKQQK
      `,
      side: `
        KYKKYKKYKKYK
        KQQKQQKQQKQK
      `,
    },
  },
});

/** A kerchief over the hair, knotted at the back. */
export const kerchief = (ramp: Ramp) =>
  part({
    palette: HAT(ramp),
    pieces: {
      head: {
        at: { down: [4, 1], up: [4, 1], side: [3, 1] },
        down: `
          .....KKKKKK.....
          ...KKYYQQQPKK...
          ..KYYQQQQQQPPK..
          .KYQQQQQQQQQPPK.
          KYQQQQQQQQQQQPPK
          KKKKKKKKKKKKKKKK
        `,
        up: `
          .....KKKKKK.....
          ...KKYQQQQPKK...
          ..KYQQQQQQQPPK..
          .KYQQQQKKQQQPPK.
          KYQQQQKQQKQQQPPK
          KKKKKKKQQKKKKKKK
          ......KKKK......
        `,
        side: `
          .....KKKKKK.....
          ...KKYYQQQPKK...
          ..KYQQQQQQQQPK..
          KKYQQQQQQQQQPPK.
          KQKQQQQQQQQQQPK.
          KKKKKKKKKKKKKKK.
        `,
      },
    },
  });

// Faces -----------------------------------------------------------------------------------------

type FaceRows = Readonly<Record<string, string>>;

/** A face with poses: `rest`, `talk`, `shout`, `shut` (eyes closed), `look` (eyes down). */
export function face(down: FaceRows, side: FaceRows): PartDef {
  return part({
    palette: ink,
    lone: `${lone}Z`,
    pieces: { head: { at: { down: [5, 8], up: [5, 8], side: [3, 8] }, down, up: null, side } },
  });
}

/** The face most townspeople share; a few draw their own. */
export const plain = face(
  {
    rest: "...^e....^e...\n...ee....ee...\n..............\n......--......",
    talk: "...^e....^e...\n...ee....ee...\n..............\n......!!......",
    shout: "...^e....^e...\n...ee....ee...\n.....!!!!.....\n......!!......",
    shut: "..............\n...--....--...\n..............\n......--......",
    look: "..............\n...ee....ee...\n..............\n......--......",
  },
  {
    rest: "...........^e..\n...........ee..\n...............\n.............-.",
    talk: "...........^e..\n...........ee..\n...............\n............!!.",
    shout: "...........^e..\n...........ee..\n............!!.\n............!!.",
    shut: "...............\n...........--..\n...............\n.............-.",
    look: "...............\n...........ee..\n...............\n.............-.",
  },
);

/** Rosy cheeks, for children, women and the shy. */
export const rosy = face(
  {
    rest: "...^e....^e...\n...ee....ee...\n...'......'...\n......--......",
    talk: "...^e....^e...\n...ee....ee...\n...'......'...\n......!!......",
    shout: "...^e....^e...\n...ee....ee...\n...'.!!!!.'...\n......!!......",
    shut: "..............\n...--....--...\n...'......'...\n......--......",
    look: "..............\n...ee....ee...\n...'......'...\n......--......",
    worry: "...ee....ee...\n...^e....^e...\n...'......'...\n.....-..-.....",
  },
  {
    rest: "...........^e..\n...........ee..\n...........'...\n.............-.",
    talk: "...........^e..\n...........ee..\n...........'...\n............!!.",
    shout: "...........^e..\n...........ee..\n...........'!!.\n............!!.",
    shut: "...............\n...........--..\n...........'...\n.............-.",
    look: "...............\n...........ee..\n...........'...\n.............-.",
    worry: "...........ee..\n...........^e..\n...........'...\n............-..",
  },
);

// Figures ---------------------------------------------------------------------------------------

export interface PersonSpec {
  readonly name: string;
  readonly group?: string;
  readonly skin: "fair" | "warm" | "deep";
  /** Parts by layer: `uniform` (dress), `jacket` (feet or shins), `face`, `hair`, `accessory`, `book`. */
  readonly parts: Readonly<Record<string, PartDef>>;
  readonly frames?: Readonly<Record<string, FramePose>>;
  readonly anim: Readonly<Record<string, Anim>>;
  readonly lookName?: string;
}

/** Builds a person on the student skeleton with the standing frames, then bakes them. */
export function person(spec: PersonSpec): RigDef {
  const parts: Record<string, Record<string, PartDef>> = {
    shadow: { blob: shadow },
    body: { base: skin },
  };
  const lookParts: Record<string, string> = { shadow: "blob", body: "base" };
  for (const [layer, def] of Object.entries(spec.parts)) {
    parts[layer] = { [layer]: def };
    lookParts[layer] = layer;
  }
  const look: Look = { parts: lookParts, slots: { skin: spec.skin } };
  // Talking is the person's own idle pose with the mouth going.
  const idle0: FramePose = spec.frames?.idle0 ?? {};
  const speaking = (head: string): FramePose =>
    typeof idle0 === "function"
      ? (d) => ({ ...(idle0(d) as Record<string, unknown>), head }) as never
      : ({ ...idle0, head } as never);
  const talk = spec.anim.talk
    ? {}
    : { talk: { frames: ["talk0", "talk1", "talk0", "idle0"], fps: 4 } as Anim };
  return bake(
    rig({
      name: spec.name,
      ...frame,
      group: spec.group ?? "page1-cast",
      parts,
      frames: {
        ...base,
        ...(spec.anim.talk ? {} : { talk0: speaking("talk"), talk1: speaking("rest") }),
        ...spec.frames,
      },
      anim: { ...spec.anim, ...talk },
      looks: { [spec.lookName ?? "town"]: look },
    }),
  );
}

export const IDLE: Anim = { frames: ["idle0", "idle0", "idle1", "idle1"], fps: 2 };
export const WALK: Anim = { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 };

// Groups ----------------------------------------------------------------------------------------

/** One member of a group frame: a person's frame (`down/idle0`) with its feet at `at`. */
export interface Placed {
  readonly person: RigDef;
  readonly key: string;
  readonly at: readonly [number, number];
  readonly flip?: boolean;
}

const compiled = new Map<string, CompiledRig>();
function compiledOf(def: RigDef): CompiledRig {
  const name = def.name as string;
  let c = compiled.get(name);
  if (!c) {
    c = compileRig(def, name, `group ${name}`);
    compiled.set(name, c);
  }
  return c;
}

/** A palette index with the look's slot keys resolved to the colours the look chose. */
function resolve(index: number, slots: Readonly<Record<string, string>>): number {
  const slot = slotOf(index);
  if (!slot) return index;
  const option = slot.options[slots[slot.name] ?? Object.keys(slot.options)[0] ?? ""];
  const name = option?.[index - slot.base];
  return name ? colorIndex(name) : index;
}

/**
 * Several people in one sprite frame, for things that move as one or fill a place as props:
 * the Pythagoreans walking in step, a row of spectators. Members are drawn back to front in the
 * order given, then the seams are cleaned and sealed like a baked figure.
 */
export function group(
  size: readonly [number, number],
  frames: Readonly<Record<string, readonly Placed[]>>,
): { palette: Legend; lone: string; frames: Record<string, string>; shadow: string } {
  const pool = [..."ABCDEFHIJKLMNPQRSTUVWXYZabcdfghijkmnopqrstuvwxy0123456789#$=?<>[]{}()|/"];
  const legend: Record<string, Paint | null> = { ".": null };
  const charOf = new Map<string, string>();
  const loneChars = new Set<string>();
  const char = (index: number, alone: boolean): string => {
    const key = `${index}${alone ? "!" : ""}`;
    let ch = charOf.get(key);
    if (!ch) {
      ch = pool.shift() as string;
      charOf.set(key, ch);
      legend[ch] = (nameOf(index).split(" / ")[0] as string).trim() as Paint;
      if (alone) loneChars.add(ch);
    }
    return ch;
  };
  const deepIndex = (index: number): number =>
    DEEP_INDICES.has(index) ? index : ((rampsOf(index)[0]?.indices[0] ?? index) as number);
  const pics = new Map<string, Pic>();
  const shadowPic = Pic.blank(size[0], size[1]);
  for (const [name, members] of Object.entries(frames)) {
    const p = Pic.blank(size[0], size[1]);
    for (const m of members) {
      const c = compiledOf(m.person);
      const look = c.looks[0];
      const img = look?.checked.get(m.key);
      if (!look || !img) throw new Error(`group ${name}: no frame ${m.key} on ${c.name}`);
      const ox = m.at[0] - c.origin[0];
      const oy = m.at[1] - c.origin[1];
      for (let y = 0; y < img.h; y++)
        for (let x = 0; x < img.w; x++) {
          const i = y * img.w + x;
          const v = img.px[i] as number;
          if (v === CLEAR) continue;
          const tx = ox + (m.flip ? img.w - 1 - x : x);
          const index = resolve(v, look.slots);
          p.set(tx, oy + y, char(index, img.lone[i] === 1));
          char(deepIndex(index), false);
        }
      // A blob shadow under each member's feet.
      for (let dx = -5; dx <= 5; dx++)
        for (let dy = -1; dy <= 1; dy++)
          if (Math.abs(dx) + Math.abs(dy) * 4 < 7) shadowPic.set(m.at[0] + dx, m.at[1] + dy, "z");
    }
    pics.set(name, p);
  }
  const keep = [...loneChars].join("");
  const deepOf: Record<string, string> = {};
  for (const [k, ch] of charOf) {
    if (k.endsWith("!")) continue;
    deepOf[ch] = charOf.get(String(deepIndex(Number(k)))) as string;
  }
  const deep = [...new Set(Object.values(deepOf))].join("");
  const out: Record<string, string> = {};
  for (const [name, p] of pics) {
    out[name] = clean(seal(clean(p, keep, deep), deepOf, keep), keep, deep).toString();
  }
  legend.z = "ink.dark";
  return { palette: legend, lone: keep, frames: out, shadow: shadowPic.toString() };
}
