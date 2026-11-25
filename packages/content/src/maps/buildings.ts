import type { Layers, Stamp, StampCell } from "./format.ts";
import type { Prop } from "./layers.ts";

const TILE = 16;
const FLOOR = 48;
/** Tiles a floor stands tall. */
export const FLOOR_TILES = FLOOR / TILE;

/**
 * Facade bays by character. A building's elevation is written one string per floor, top floor
 * first, one character per 16-pixel bay:
 *
 *     <WWBW##[]WWoW>     ground floor of a cream building with its main doors
 *
 * `<` and `>` close the ends, `#` is plain wall, `|` a pier, `[` `]` a glass double door, `d` a steel side
 * door, `C` a bay of curtain glass. The rest are windows: `W` sky in the glass, `B` blinds down,
 * `x` an empty dark room, `o` open with the curtain out, `L` lights on, `P` a poster taped up,
 * `p` a plant on the sill, `f` someone looking out.
 */
const BAYS: Readonly<Record<string, string>> = {
  "#": "wall",
  "|": "pier",
  "<": "end-l",
  ">": "end-r",
  W: "sky",
  B: "blind",
  x: "dark",
  o: "open",
  L: "lit",
  P: "poster",
  p: "plant",
  f: "face",
};

export interface BuildingSpec {
  /** Region prefix and stamp name. */
  readonly name: string;
  /** Facade sprite (`bld-cream`); its curtain sprite is `<material>-curtain`, side `-side`. */
  readonly material: string;
  /** Roof sprite: flat-roof tiles, or with `pitched` one slope piece per bay (`l`, `m`, `r`). */
  readonly roof: string;
  readonly pitched?: boolean;
  /** Roof depth in tiles above the top floor. */
  readonly roofRows: number;
  /** Top floor first, one character per bay. Every floor is as wide as the ground floor. */
  readonly floors: readonly string[];
  /** Draw the shaded east face. */
  readonly side?: boolean;
  /** Art on the roof and against the walls, relative to the building's top-left pixel. */
  readonly extras?: (ox: number, oy: number, base: number) => Layers;
}

/**
 * Turns an elevation into a stamp: the footprint solid (roof and facade, plus the east face's
 * column), a `door` region on the tiles in front of each glass door pair (`door`, `door2`, ...),
 * a `side-door` region in front of each steel door, and the art: roof tiles, facade bays, the
 * east face, every piece sorting by the front wall.
 */
export function building(spec: BuildingSpec): Stamp {
  const ground = spec.floors[spec.floors.length - 1] ?? "";
  const w = ground.length;
  for (const [i, f] of spec.floors.entries()) {
    if (f.length !== w)
      throw new Error(`building ${spec.name}: floor ${i + 1} is ${f.length} bays, not ${w}`);
  }
  const floors = spec.floors.length;
  const h = spec.roofRows + floors * FLOOR_TILES;
  const sideCol = spec.side ? 1 : 0;

  // Footprint plus a front row carrying door regions.
  const rows: string[] = [];
  for (let y = 0; y < h; y++) rows.push("#".repeat(w + sideCol));
  const front = [...".".repeat(w + sideCol)];
  const legend: Record<string, StampCell> = { "#": { solid: "#" } };
  let doors = 0;
  const regionChars = "abcdefghijklmnopqrstuvwxyz";
  [...ground].forEach((ch, x) => {
    if (ch === "[") {
      const c = regionChars[doors] as string;
      const name = doors === 0 ? "door" : `door${doors + 1}`;
      legend[c] = { region: name };
      front[x] = c;
      front[x + 1] = c;
      doors++;
    }
  });
  let sideDoors = 0;
  [...ground].forEach((ch, x) => {
    if (ch === "d") {
      const c = regionChars.toUpperCase()[sideDoors] as string;
      legend[c] = { region: sideDoors === 0 ? "side-door" : `side-door${sideDoors + 1}` };
      front[x] = c;
      sideDoors++;
    }
  });
  rows.push(front.join(""));

  const things = (ox: number, oy: number): Layers => {
    const base = oy + h * TILE;
    const objects: Prop[] = [];
    const piece = (prop: string, frame: string, x: number, y: number, repeat = 1): void => {
      objects.push({ prop, frame, at: [x, y], sort: base, ...(repeat > 1 ? { repeat } : {}) });
    };
    // A pitched roof: one slope piece per bay, standing on the top floor.
    if (spec.pitched) {
      for (let x = 0; x < w; x++) {
        const frame = x === 0 ? "l" : x === w - 1 ? "r" : "m";
        piece(spec.roof, frame, ox + x * TILE, oy + spec.roofRows * TILE - 1);
      }
    }
    // A flat roof: corners and edges around the paint, fills varied by a fixed pattern.
    for (let r = 0; r < (spec.pitched ? 0 : spec.roofRows); r++) {
      const y = oy + (r + 1) * TILE - 1;
      const edge = r === 0 ? "n" : r === spec.roofRows - 1 ? "s" : "";
      for (let x = 0; x < w; x++) {
        const side = x === 0 ? "w" : x === w - 1 ? "e" : "";
        let frame = `${edge}${side}`;
        if (!frame) frame = `fill${[0, 0, 1, 0, 3, 0, 2, 0][(x * 5 + r * 3) % 8]}`;
        piece(spec.roof, frame, ox + x * TILE, y);
      }
    }
    // Floors, top first.
    spec.floors.forEach((floor, i) => {
      const fromBottom = floors - 1 - i;
      const isGround = fromBottom === 0;
      const y = base - 1 - fromBottom * FLOOR;
      const p = isGround ? "g" : "u";
      [...floor].forEach((ch, x) => {
        const px = ox + x * TILE;
        if (ch === "C") piece(`${spec.material}-curtain`, p, px, y);
        else if (ch === "[") piece(spec.material, "door-l", px, y);
        else if (ch === "]") piece(spec.material, "door-r", px, y);
        else if (ch === "d") piece(spec.material, "door-side", px, y);
        else {
          const bay = BAYS[ch];
          if (!bay) throw new Error(`building ${spec.name}: bay "${ch}" is not known`);
          piece(spec.material, `${p}-${bay}`, px, y);
        }
      });
      if (spec.side) piece(`${spec.material}-side`, isGround ? "ground" : "up", ox + w * TILE, y);
    });
    const extra = spec.extras?.(ox, oy, base) ?? {};
    return { ...extra, objects: [...objects, ...(extra.objects ?? [])] };
  };

  return { name: spec.name, grid: rows.join("\n"), legend, things };
}
