import { readFileSync } from "node:fs";
import path from "node:path";
import { type LookOptions, type LookSource, lookOptions } from "@guago/shared";

/** The art build's metadata; `pnpm art:build` (run by `pnpm dev` and `pnpm build`) writes it. */
export const ART_JSON = path.resolve(import.meta.dirname, "../../../packages/art/dist/art.json");

let art: LookSource | undefined;
let cached: LookOptions | undefined;
let jackets: readonly string[] | undefined;

function readArt(): LookSource {
  if (!art) {
    try {
      art = JSON.parse(readFileSync(ART_JSON, "utf8")) as LookSource;
    } catch {
      throw new Error(`${ART_JSON} is missing; run pnpm art:build`);
    }
  }
  return art;
}

/** Student look ids a character may wear, read once from the built art metadata. */
export function studentLooks(): LookOptions {
  cached ??= lookOptions(readArt());
  return cached;
}

/** 과잠 colours a club may pick: the options of the art's `jacket` swap slot. */
export function clubJackets(): readonly string[] {
  jackets ??= Object.keys(readArt().slots.jacket?.options ?? {});
  return jackets;
}
