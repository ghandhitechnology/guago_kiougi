import { readFileSync } from "node:fs";
import path from "node:path";
import { type LookOptions, type LookSource, lookOptions } from "@guago/shared";

/** The art build's metadata; `pnpm art:build` (run by `pnpm dev` and `pnpm build`) writes it. */
export const ART_JSON = path.resolve(import.meta.dirname, "../../../packages/art/dist/art.json");

let cached: LookOptions | undefined;

/** Student look ids a character may wear, read once from the built art metadata. */
export function studentLooks(): LookOptions {
  if (!cached) {
    let art: LookSource;
    try {
      art = JSON.parse(readFileSync(ART_JSON, "utf8"));
    } catch {
      throw new Error(`${ART_JSON} is missing; run pnpm art:build`);
    }
    cached = lookOptions(art);
  }
  return cached;
}
