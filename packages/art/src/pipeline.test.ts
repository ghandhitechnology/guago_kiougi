import { describe, expect, it } from "vitest";
import { BL, BR, dualMask, pickTiles, TL, TR } from "./dualgrid.ts";
import { part, rig } from "./format.ts";
import { ArtError, parseGrid } from "./grid.ts";
import { pack } from "./pack.ts";
import { colorIndex } from "./palette.ts";
import { CLEAR } from "./raster.ts";
import { compileRig } from "./rig.ts";

const legend = { ".": null, o: "red.deep", r: "red.mid" } as const;

describe("parseGrid", () => {
  it("trims indentation and blank edge lines", () => {
    const img = parseGrid(
      `
        .o
        or
      `,
      legend,
      "t",
      { w: 2, h: 2 },
    );
    expect([...img.px]).toEqual([
      CLEAR,
      colorIndex("red.deep"),
      colorIndex("red.deep"),
      colorIndex("red.mid"),
    ]);
  });

  it("names the row of a wrong-width line", () => {
    expect(() => parseGrid("oo\nooo", legend, "odap.ts › odap › idle0", { w: 2 })).toThrow(
      "odap.ts › odap › idle0 › row 2: is 3 wide, expected 2",
    );
  });

  it("rejects characters missing from the legend", () => {
    expect(() => parseGrid("ox", legend, "t", {})).toThrow(ArtError);
  });

  it("rejects unknown palette names", () => {
    expect(() => parseGrid("o", { o: "red.shiny" }, "t", {})).toThrow('unknown colour "red.shiny"');
  });
});

describe("rig assembly", () => {
  const box = (ch: string) => `${ch}${ch}\n${ch}${ch}`;
  const doll = rig({
    size: [6, 6],
    directions: ["down", "up", "side"],
    bones: { torso: null, head: "torso" },
    layers: ["body", "hair"],
    parts: {
      body: {
        base: part({
          palette: legend,
          pieces: { torso: { at: [2, 4], down: box("r"), up: box("r"), side: box("r") } },
        }),
      },
      hair: {
        tuft: part({
          palette: legend,
          pieces: {
            head: {
              at: { down: [2, 0], up: [2, 0], side: [3, 0] },
              down: { rest: box("o"), hurt: "oo", lifted: { at: [0, 4], grid: "oo" } },
              up: box("o"),
              side: null,
            },
          },
        }),
      },
    },
    frames: { idle0: {}, bob: { torso: [0, 1] }, hurt: { head: "hurt" }, lift: { head: "lifted" } },
    anim: { idle: { frames: ["idle0", "bob"], fps: 2 } },
    looks: { a: { parts: { body: "base", hair: "tuft" } } },
  });
  const compiled = compileRig(doll, "doll", "doll.ts › doll");
  const look = compiled.looks[0];
  const at = (key: string, x: number, y: number) => look?.frames.get(key)?.px[y * 6 + x];

  it("moves child bones with their parent", () => {
    expect(at("down/idle0", 2, 0)).toBe(colorIndex("red.deep"));
    expect(at("down/bob", 2, 0)).toBe(CLEAR);
    expect(at("down/bob", 2, 1)).toBe(colorIndex("red.deep"));
    expect(at("down/bob", 2, 5)).toBe(colorIndex("red.mid"));
  });

  it("swaps pose grids and falls back to rest", () => {
    expect(at("down/hurt", 2, 1)).toBe(CLEAR);
    expect(at("up/hurt", 2, 1)).toBe(colorIndex("red.deep"));
  });

  it("places a pose with its own position there", () => {
    expect(at("down/lift", 0, 4)).toBe(colorIndex("red.deep"));
    expect(at("down/lift", 2, 0)).toBe(CLEAR);
  });

  it("draws nothing for a null direction", () => {
    expect(at("side/idle0", 3, 0)).toBe(CLEAR);
  });

  it("requires every direction on every piece", () => {
    const broken = {
      ...doll,
      parts: { body: { base: part({ palette: legend, pieces: { torso: { down: "r" } } }) } },
    };
    expect(() => compileRig(broken, "doll", "doll")).toThrow(
      "doll › body.base › torso › up: missing",
    );
  });
});

describe("dual grid", () => {
  const grid = { w: 3, h: 2, cells: [1, 0, 0, 1, 1, 0] };

  it("sets one bit per upper corner", () => {
    expect(dualMask(grid, 1, 1, 1)).toBe(TL | BL | BR);
    expect(dualMask(grid, 1, 2, 1)).toBe(BL);
    expect(dualMask(grid, 1, 3, 1)).toBe(0);
  });

  it("clamps outside cells to the nearest edge", () => {
    expect(dualMask(grid, 1, 0, 0)).toBe(TL | TR | BL | BR);
  });

  it("picks a stable tile per position from the mask's variants", () => {
    const masks = Array.from({ length: 16 }, (_, m) => [m * 10, m * 10 + 1]);
    const a = pickTiles(grid, 1, masks, 3);
    expect(a).toEqual(pickTiles(grid, 1, masks, 3));
    expect(a.length).toBe(4 * 3);
    expect(Math.floor((a[1 * 4 + 1] as number) / 10)).toBe(TL | BL | BR);
    expect(Math.floor((a[0] as number) / 10)).toBe(TL | TR | BL | BR);
  });
});

describe("pack", () => {
  it("places rects without overlap inside the chosen size", () => {
    const rects = Array.from({ length: 40 }, (_, i) => ({
      key: `r${i}`,
      w: 5 + (i % 7),
      h: 3 + (i % 5),
    }));
    const out = pack(rects, 2048, 1);
    expect(out).not.toBeNull();
    if (!out) return;
    const placed = rects.map((r) => ({ ...r, ...(out.at.get(r.key) as { x: number; y: number }) }));
    for (const a of placed) {
      expect(a.x + a.w).toBeLessThanOrEqual(out.w);
      expect(a.y + a.h).toBeLessThanOrEqual(out.h);
      for (const b of placed) {
        if (a === b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("is deterministic and reports overflow", () => {
    const rects = [
      { key: "a", w: 10, h: 10 },
      { key: "b", w: 10, h: 10 },
    ];
    expect(pack(rects)).toEqual(pack([...rects].reverse()));
    expect(pack([{ key: "big", w: 3000, h: 4 }])).toBeNull();
  });
});
