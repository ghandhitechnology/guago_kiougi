import { join } from "node:path";
import { bakeMaps } from "./bake.ts";
import { ART_ROOT, compileAll } from "./compile.ts";
import { metadata, writeOutput } from "./emit.ts";
import { buildMaps } from "./maps.ts";

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
const built = buildMaps(DIST, metadata(art, atlases, fonts));
if (built.problems.length > 0) {
  const n = built.problems.length;
  console.error(`\nmap checks found ${n} problem${n === 1 ? "" : "s"}:\n`);
  for (const p of built.problems) console.error(`  ${p}`);
  process.exit(1);
}
const t0 = performance.now();
const baked = bakeMaps(DIST, metadata(art, atlases, fonts), atlases, built.maps);
const ms = Math.round(performance.now() - t0);
for (const m of built.maps) {
  const kb = Math.round((baked.get(m.id) ?? 0) / 1024);
  console.log(`map ${m.id.padEnd(12)} ${m.w}×${m.h}  ${m.name}  baked ${kb} kB`);
}
console.log(`maps baked in ${ms} ms`);
