import { describe, expect, it } from "vitest";
import { EFFECTS } from "../content/index.ts";
import { EffectError, type EffectSource, parseEffect } from "./format.ts";

const tone: EffectSource = {
  category: "ui",
  layers: [{ wave: "sine", freq: 880, attack: 0.002, hold: 0.02, decay: 0.1 }],
};

describe("effect parameters", () => {
  it("fills defaults", () => {
    const fx = parseEffect("t", tone);
    expect(fx.variants).toBe(1);
    expect(fx.vary).toBe(0.06);
    expect(fx.priority).toBe(1);
    expect(fx.max).toBe(3);
  });

  it("rejects values that would sound wrong instead of failing loudly", () => {
    expect(() => parseEffect("t", { ...tone, layers: [] })).toThrow(EffectError);
    const layer = tone.layers[0] as EffectSource["layers"][number];
    expect(() => parseEffect("t", { ...tone, layers: [layer, layer, layer, layer] })).toThrow(
      EffectError,
    );
    expect(() => parseEffect("t", { ...tone, layers: [{ ...layer, duty: 1.5 }] })).toThrow(
      EffectError,
    );
    expect(() =>
      parseEffect("t", { ...tone, layers: [{ ...layer, attack: 0, hold: 0, decay: 0 }] }),
    ).toThrow(EffectError);
    expect(() => parseEffect("t", { ...tone, vary: 0.5 })).toThrow(EffectError);
  });

  it("accepts every shipped effect", () => {
    for (const [id, source] of Object.entries(EFFECTS))
      expect(() => parseEffect(id, source)).not.toThrow();
  });
});
