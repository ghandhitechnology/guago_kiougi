import { join } from "node:path";
import { ART_ROOT, compileAll } from "./compile.ts";
import { writeOutput } from "./emit.ts";

export const DIST = join(ART_ROOT, "dist");

const { art, problems } = await compileAll();
if (problems.length > 0) {
  console.error(`art:build found ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
const atlases = writeOutput(DIST, art);
for (const a of atlases) {
  console.log(`${a.name.padEnd(16)} ${a.png.w}×${a.png.h}  ${Object.keys(a.frames).length} frames`);
}
