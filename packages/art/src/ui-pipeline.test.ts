import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { checkSlice } from "./checks.ts";
import { buildGlyphFont, maskPng } from "./fonts.ts";
import { glyphs } from "./format.ts";
import { compileGlyphs } from "./glyphs.ts";
import { parseGrid } from "./grid.ts";
import { measure, parseBmFont } from "./sheet/bmfont.ts";
import { sliceRects } from "./sheet/ui-ops.ts";

const legend = { ".": null, o: "ink.deep", W: "stone.bright" } as const;

describe("nine-slice", () => {
  it("accepts a frame whose middle column and row repeat", () => {
    const img = parseGrid("ooooo\noWWWo\noWWWo\nooooo", legend, "t", {});
    expect(checkSlice(img, [1, 1, 1, 1], "t")).toEqual([]);
  });

  it("names the first column that would smear when stretched", () => {
    const img = parseGrid("ooooo\noWoWo\noWoWo\nooooo", legend, "t", {});
    expect(checkSlice(img, [1, 1, 1, 1], "t")).toEqual([
      "t (2,1): column 2 differs from column 1, the stretched middle",
    ]);
  });

  it("splits a stretch into nine regions that tile the destination", () => {
    const rects = sliceRects([14, 24], [7, 5, 17, 5], 100, 60);
    expect(rects).toHaveLength(9);
    const area = rects.reduce((n, r) => n + r.dw * r.dh, 0);
    expect(area).toBe(100 * 60);
    expect(rects[4]).toEqual({ sx: 7, sy: 17, sw: 2, sh: 2, dx: 7, dy: 17, dw: 88, dh: 38 });
  });
});

describe("bitmap fonts", () => {
  it("writes glyph fonts as BMFont XML with shared drawings and spacing", () => {
    const def = glyphs({
      palette: legend,
      height: 3,
      spacing: -1,
      space: 2,
      glyphs: { "1": "oWo\noWo\nooo", "-−": "...\nooo\n..." },
    });
    const font = parseBmFont(buildGlyphFont(compileGlyphs(def, "t", "t")).xml);
    expect(font.lineHeight).toBe(3);
    expect(font.chars.get("-".codePointAt(0) as number)).toEqual(
      font.chars.get("−".codePointAt(0) as number),
    );
    // Two glyphs three wide overlap by one; a space adds two.
    expect(measure(font, "1-")).toBe(4);
    expect(measure(font, "1 1")).toBe(6);
  });

  it("encodes a 1-bit atlas that decodes to white on clear", () => {
    const on = new Uint8Array([1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    const png = PNG.sync.read(maskPng(5, 2, on));
    const alpha = [...on.keys()].map((i) => png.data[i * 4 + 3]);
    expect(alpha).toEqual([...on].map((v) => (v ? 255 : 0)));
    expect(png.data[0]).toBe(255);
  });
});
