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
import { bake, base, feet, shins } from "./sprites/bosses/freed.ts";
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
  /** `short` ends at the knee, `long` at the ankle. */
  readonly length: "short" | "long";
  /** Sleeves: `short` cloth to the elbow, `bare` arms, `long` cloth to the wrist. */
  readonly sleeves?: "short" | "bare" | "long";
  /** A himation over the left shoulder and across the body, in its own colour. */
  readonly drape?: Ramp;
  /** An apron over the front (cooks, potters, fishmongers). */
  readonly apron?: Ramp;
}

/** Rows of the torso grid, the belt included, cut to the dress length and closed at the hem. */
function torso(rows: readonly string[], length: "short" | "long", w: number): string[] {
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
  grey: { X: "ink.deep", x: "ink.mid", h: "stone.dark", H: "stone.mid" },
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
  return bake(
    rig({
      name: spec.name,
      ...frame,
      group: spec.group ?? "page1-cast",
      parts,
      frames: { ...base, ...spec.frames },
      anim: spec.anim,
      looks: { [spec.lookName ?? "town"]: look },
    }),
  );
}

export const IDLE: Anim = { frames: ["idle0", "idle0", "idle1", "idle1"], fps: 2 };
export const WALK: Anim = { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 };
