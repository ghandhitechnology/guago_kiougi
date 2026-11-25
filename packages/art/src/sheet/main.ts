/**
 * `pnpm art:sheet` builds the art, then serves the contact sheet page.
 * `pnpm art:sheet --png <dir>` writes the same content as static PNG sheets instead.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { extname, join, normalize, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ART_ROOT, compileAll } from "../build/compile.ts";
import { metadata, writeOutput } from "../build/emit.ts";
import { COLORS, colorIndex } from "../palette.ts";
import type { SceneMeta } from "../scene.ts";
import { galmuriDir } from "./font.ts";
import {
  loadFonts,
  paletteSheet,
  rigSheet,
  sceneScreens,
  sceneSheet,
  spriteSheet,
  terrainSheet,
} from "./static.ts";
import { uiSheets } from "./ui-static.ts";

const { values } = parseArgs({
  options: { png: { type: "string" }, port: { type: "string", default: "4310" } },
});

const DIST = join(ART_ROOT, "dist");
const { art, problems } = await compileAll();
if (problems.length > 0) {
  console.error(
    `art checks found ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`,
  );
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
const { atlases, fonts: built } = writeOutput(DIST, art);

if (values.png) {
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), values.png);
  mkdirSync(dir, { recursive: true });
  const fonts = loadFonts();
  const meta = metadata(art, atlases, built) as SceneMeta;
  const sheets = {
    scenes: sceneSheet(fonts, meta, atlases),
    ...Object.fromEntries(
      [...sceneScreens(meta, atlases)].map(([name, png]) => [`scene-${name}`, png]),
    ),
    palette: paletteSheet(fonts),
    sprites: spriteSheet(fonts, art),
    rigs: rigSheet(fonts, art),
    terrain: terrainSheet(fonts, art),
    ...uiSheets(art, built, meta, atlases),
  };
  for (const [name, png] of Object.entries(sheets)) {
    const file = join(dir, `${name}.png`);
    writeFileSync(file, png.png());
    console.log(file);
  }
  process.exit(0);
}

const color = (name: string): string => COLORS[colorIndex(name)] as string;

const HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>과고키우기 art</title>
<style>
@font-face { font-family: Galmuri9; src: url(fonts/Galmuri9.woff2) format("woff2"); }
@font-face { font-family: Galmuri11; font-weight: 700; src: url(fonts/Galmuri11-Bold.woff2) format("woff2"); }
:root {
  --bg: ${color("ink.deep")};
  --line: ${color("ink.dark")};
  --dim: ${color("ink.light")};
  --text: ${color("stone.light")};
  --head: ${color("stone.bright")};
  --check-a: ${color("stone.mid")};
  --check-b: ${color("stone.light")};
  --edge: ${color("ink.mid")};
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); }
body { font: 12px/16px Galmuri9, monospace; -webkit-font-smoothing: none; font-smooth: never; padding: 24px 32px 64px; }
h2 { font: 700 16px/20px Galmuri11, monospace; color: var(--head); margin: 0 0 16px; padding-top: 24px; border-top: 2px solid var(--line); }
h3 { font: 12px/16px Galmuri9, monospace; color: var(--dim); margin: 12px 0 6px; }
h3.name { font: 700 16px/20px Galmuri11, monospace; color: var(--text); margin: 8px 0 8px; }
section { margin-bottom: 32px; padding: 0 8px 8px; }
article { margin-bottom: 28px; }
canvas { display: block; image-rendering: pixelated; }
figure { margin: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
figcaption { color: var(--dim); }
.row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: flex-end; margin-bottom: 8px; }
.pair { display: flex; gap: 4px; }
.ramp { display: block; width: 64px; align-self: center; }
.swatch { display: block; width: 32px; height: 32px; border: 1px solid var(--edge); }
.swatch.none { background: transparent; border-color: transparent; }
.strip { display: flex; border: 1px solid var(--edge); }
.chip { display: block; width: 10px; height: 16px; }
.dim { color: var(--dim); }
</style>
</head>
<body>
<script type="module" src="src/sheet/page.ts"></script>
</body>
</html>
`;

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function inside(root: string, path: string): string | null {
  const full = normalize(join(root, path));
  return full.startsWith(root) ? full : null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = decodeURIComponent(url.pathname);
  try {
    if (path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }
    let file: string | null = null;
    if (path.startsWith("/dist/")) file = inside(DIST, path.slice(6));
    else if (path.startsWith("/fonts/")) file = inside(galmuriDir(), path.slice(7));
    else if (path.startsWith("/src/") && path.endsWith(".ts"))
      file = inside(join(ART_ROOT, "src"), path.slice(5));
    if (!file) throw new Error("not found");
    if (file.endsWith(".ts")) {
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(stripTypeScriptTypes(readFileSync(file, "utf8")));
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});

server.listen(Number(values.port), () => {
  console.log(`contact sheet on http://localhost:${values.port}`);
});
