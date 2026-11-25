import { describe, expect, it } from "vitest";
import { MOTIF, motifRows, quote } from "../content/music/motif.ts";
import { compileSong } from "./compile.ts";
import type { SongSource } from "./format.ts";
import { noteNumber, ParseError, parsePhrase, parseToken, phraseRef } from "./parse.ts";
import { nextRow, rowStart, songShape, tickStart, timing } from "./schedule.ts";

describe("phrase parsing", () => {
  it("reads notes, octaves and accidentals", () => {
    expect(noteNumber("C4")).toBe(60);
    expect(noteNumber("A4")).toBe(69);
    expect(noteNumber("Bb3")).toBe(58);
    expect(noteNumber("F#5")).toBe(78);
    expect(noteNumber("H4")).toBeNull();
  });

  it("expands lengths and keeps rows aligned", () => {
    const rows = parsePhrase("C5*2 F5*6 E5*2 C5*6 | D5*4 A4*8 -*4", 16);
    expect(rows).toHaveLength(32);
    expect(rows[0]?.notes).toEqual([72]);
    expect(rows[1]).toBeNull();
    expect(rows[2]?.notes).toEqual([77]);
    expect(rows[28]?.kind).toBe("off");
  });

  it("reads chords, drums, volume and effects", () => {
    const chord = parseToken("F3,A3,C4v9a37*8").cell;
    expect(chord?.notes).toEqual([53, 57, 60]);
    expect(chord?.vol).toBeCloseTo(9 / 15);
    expect(chord?.fx).toEqual([{ code: "a", value: 0x37 }]);
    expect(parseToken("C5*8").rows).toBe(8);
    expect(parseToken("K,Hv6").cell?.drums).toEqual(["K", "H"]);
    expect(parseToken(".d02*8").cell?.fx).toEqual([{ code: "d", value: 2 }]);
  });

  it("rejects a bar line that is not on a bar boundary", () => {
    expect(() => parsePhrase("C5*4 D5*4 | E5*8", 16)).toThrow(ParseError);
    expect(() => parsePhrase("C5*16 | E5*16", 16)).not.toThrow();
  });

  it("rejects malformed tokens", () => {
    expect(() => parseToken("C5a3")).toThrow(ParseError);
    expect(() => parseToken("C5*0")).toThrow(ParseError);
    expect(() => parseToken("C5z12")).toThrow(ParseError);
  });

  it("splits transposed phrase names", () => {
    expect(phraseRef("lead+2")).toEqual({ name: "lead", transpose: 2 });
    expect(phraseRef("lead-12")).toEqual({ name: "lead", transpose: -12 });
    expect(phraseRef("lead")).toEqual({ name: "lead", transpose: 0 });
  });
});

describe("timing", () => {
  it("places rows from the absolute count, without drift", () => {
    const t = timing(48000, 84, 4);
    // 84 BPM, sixteenth rows: 48000 * 60 / 336 samples per row.
    expect(rowStart(t, 1)).toBe(Math.floor((48000 * 60) / 336));
    // After ten thousand bars the boundary is still the exact product, not a running sum.
    const row = 160000;
    expect(rowStart(t, row)).toBe(Math.floor((row * 48000 * 60) / 336));
  });

  it("pushes odd rows late by the swing amount", () => {
    const t = timing(48000, 120, 4, 0.25);
    const spr = 6000;
    expect(rowStart(t, 0)).toBe(0);
    expect(rowStart(t, 1)).toBe(Math.floor(1.25 * spr));
    expect(rowStart(t, 2)).toBe(2 * spr);
  });

  it("splits a row into ticks", () => {
    const t = timing(48000, 120, 4, 0, 6);
    expect(tickStart(t, 0, 0)).toBe(0);
    expect(tickStart(t, 0, 3)).toBe(3000);
    expect(tickStart(t, 1, 0)).toBe(6000);
  });

  it("walks the order and loops", () => {
    const frames = [32, 128, 128];
    expect(nextRow(frames, 1, { frame: 0, row: 31 })).toEqual({ frame: 1, row: 0 });
    expect(nextRow(frames, 1, { frame: 2, row: 127 })).toEqual({ frame: 1, row: 0 });
    expect(nextRow(frames, false, { frame: 2, row: 127 })).toBeNull();
    expect(songShape(frames, 1)).toEqual({ intro: 32, loop: 256 });
  });

  it("loops inside a part instead of the whole song", () => {
    const frames = [32, 64, 64, 64];
    expect(nextRow(frames, 0, { frame: 2, row: 63 }, [1, 2])).toEqual({ frame: 1, row: 0 });
    expect(nextRow(frames, 0, { frame: 1, row: 63 }, [1, 2])).toEqual({ frame: 2, row: 0 });
    expect(nextRow(frames, false, { frame: 3, row: 63 }, [3, 3])).toEqual({ frame: 3, row: 0 });
  });
});

describe("songs", () => {
  const base: SongSource = {
    title: "t",
    key: "C",
    bpm: 120,
    rowsPerBeat: 4,
    beatsPerBar: 4,
    instruments: {
      a: { kind: "osc", gain: 1, osc: [{ wave: "sine" }], env: { a: 0, d: 0, s: 1, r: 0 } },
    },
    channels: [
      { name: "x", instrument: "a", stem: "main" },
      { name: "y", instrument: "a", stem: "main" },
    ],
    phrases: { p: "C4*16", q: "C4*8" },
    order: [{ x: "p", y: "p" }],
    loop: 0,
  };

  it("rejects frames whose phrases differ in length", () => {
    expect(() => compileSong("t", { ...base, order: [{ x: "p", y: "q" }] })).toThrow(/rows/);
  });

  it("rejects unknown phrases and channels", () => {
    expect(() => compileSong("t", { ...base, order: [{ x: "nope" }] })).toThrow(/unknown phrase/);
    expect(() => compileSong("t", { ...base, order: [{ z: "p" }] })).toThrow(/unknown channel/);
  });
});

describe("school motif", () => {
  it("is two bars in F major as documented", () => {
    expect(motifRows()).toBe(32);
    expect(quote({ tonic: "F5" })).toBe("C5*2 F5*6 E5*2 C5*6 D5*4 A4*8 -*4");
  });

  it("changes mood without changing shape", () => {
    expect(quote({ tonic: "F5", mode: "harmonic" })).toBe("C5*2 F5*6 E5*2 C5*6 C#5*4 G#4*8 -*4");
    expect(quote({ tonic: "C5", stretch: 0.5 })).toBe("G4 C5*3 B4 G4*3 A4*2 E4*4 -*2");
    expect(quote({ tonic: "F5", stretch: 2 }).split(" ")).toHaveLength(MOTIF.length);
  });
});
