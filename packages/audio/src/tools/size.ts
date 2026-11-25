/**
 * `pnpm --filter @guago/audio size` bundles a minimal client entry with Vite, the way the game
 * client will, and reports what the audio package adds to the first load: the main-thread chunk
 * and the worker chunk, minified and gzipped.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../node_modules/.size");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
writeFileSync(
  join(root, "index.html"),
  `<!doctype html><script type="module" src="./main.ts"></script>`,
);
writeFileSync(
  join(root, "main.ts"),
  `import { audio } from "../../src/index.ts";\naudio.unlock();\naudio.music("hub");\naudio.play("ui.open");\n`,
);

await build({
  root,
  logLevel: "warn",
  build: { outDir: join(root, "dist"), emptyOutDir: true, assetsInlineLimit: 0 },
});

const files: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".js")) files.push(p);
  }
};
walk(join(root, "dist"));
let raw = 0;
let gz = 0;
for (const f of files) {
  const b = readFileSync(f);
  const g = gzipSync(b, { level: 9 }).length;
  raw += b.length;
  gz += g;
  console.log(
    `${f.slice(root.length + 1).padEnd(40)} ${(b.length / 1024).toFixed(1)} kB  gzip ${(g / 1024).toFixed(1)} kB`,
  );
}
console.log(
  `${"total".padEnd(40)} ${(raw / 1024).toFixed(1)} kB  gzip ${(gz / 1024).toFixed(1)} kB`,
);
rmSync(root, { recursive: true, force: true });
