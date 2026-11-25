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
const { atlases, fonts } = writeOutput(DIST, art);
for (const a of atlases) {
  console.log(`${a.name.padEnd(16)} ${a.png.w}×${a.png.h}  ${Object.keys(a.frames).length} frames`);
}
for (const f of fonts) {
  const kb = (n: number) => `${(n / 1024).toFixed(0)} kB`;
  console.log(
    `${f.name.padEnd(16)} ${f.meta.chars} chars  png ${kb(f.png.length)}  xml ${kb(Buffer.byteLength(f.xml))}`,
  );
}
