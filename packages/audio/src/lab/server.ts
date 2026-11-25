/**
 * `pnpm audio:lab` serves the audio lab on http://localhost:4312: every song, effect and ambient
 * bed with play and stop, the mixer, and the song's pattern while it plays. TypeScript is served
 * with its types stripped, so the page runs the package's own source.
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { COLORS, colorIndex } from "../../../art/src/palette.ts";

const { values } = parseArgs({ options: { port: { type: "string", default: "4312" } } });
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = join(dirname(createRequire(import.meta.url).resolve("galmuri/package.json")), "dist");

const c = (name: string): string => COLORS[colorIndex(name)] as string;

const HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>과고키우기 audio</title>
<style>
@font-face { font-family: Galmuri9; src: url(/fonts/Galmuri9.woff2) format("woff2"); }
@font-face { font-family: Galmuri11; font-weight: 700; src: url(/fonts/Galmuri11-Bold.woff2) format("woff2"); }
:root {
  --bg: ${c("ink.deep")};
  --panel: ${c("ink.dark")};
  --line: ${c("ink.mid")};
  --dim: ${c("stone.dark")};
  --text: ${c("stone.light")};
  --head: ${c("stone.bright")};
  --on: ${c("gold.light")};
  --on-bg: ${c("wood.dark")};
  --meter: ${c("sea.light")};
  --hot: ${c("red.light")};
  --row: ${c("navy.dark")};
  --bar: ${c("navy.deep")};
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); }
body { font: 12px/16px Galmuri9, monospace; -webkit-font-smoothing: none; padding: 16px; }
h1, h2 { font: 700 16px/20px Galmuri11, monospace; color: var(--head); margin: 0 0 8px; }
h1 { margin-bottom: 16px; }
main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
@media (max-width: 900px) { main { grid-template-columns: minmax(0, 1fr); } }
section { border: 2px solid var(--line); background: var(--panel); padding: 8px 10px 10px; margin-bottom: 16px; }
button { font: inherit; color: var(--text); background: var(--bg); border: 2px solid var(--line); padding: 2px 8px; cursor: pointer; }
button:hover { border-color: var(--dim); color: var(--head); }
button.on { background: var(--on-bg); border-color: var(--on); color: var(--on); }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }
.song { display: grid; grid-template-columns: auto auto 1fr; gap: 6px; align-items: center; margin-bottom: 6px; }
.dim { color: var(--dim); }
.grid { display: flex; flex-wrap: wrap; gap: 4px; }
.group { margin-bottom: 8px; }
.group > div:first-child { color: var(--dim); margin-bottom: 4px; }
label.slider { display: grid; grid-template-columns: 64px 1fr 36px; gap: 8px; align-items: center; margin-bottom: 6px; }
input[type=range] { -webkit-appearance: none; appearance: none; height: 16px; background: transparent; width: 100%; }
input[type=range]::-webkit-slider-runnable-track { height: 4px; background: var(--line); }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 16px; margin-top: -6px; background: var(--text); border: 0; border-radius: 0; }
input[type=range]::-moz-range-track { height: 4px; background: var(--line); }
input[type=range]::-moz-range-thumb { width: 10px; height: 16px; background: var(--text); border: 0; border-radius: 0; }
canvas { display: block; image-rendering: pixelated; }
#pattern { height: 360px; overflow: hidden; position: relative; border: 2px solid var(--line); background: var(--bg); }
#pattern table { border-collapse: collapse; position: absolute; left: 0; top: 0; }
#pattern td, #pattern th { padding: 0 6px; white-space: pre; text-align: left; height: 16px; }
#pattern th { color: var(--dim); font-weight: normal; position: sticky; top: 0; background: var(--panel); }
#pattern tr.bar td { background: var(--bar); }
#pattern tr.now td { background: var(--row); color: var(--on); }
#pattern td.n { color: var(--dim); }
pre { margin: 0; color: var(--dim); white-space: pre-wrap; }
</style>
</head>
<body>
<script type="module" src="/src/lab/page.ts"></script>
</body>
</html>
`;

const TYPES: Record<string, string> = { ".woff2": "font/woff2" };

function inside(root: string, path: string): string | null {
  const full = normalize(join(root, path));
  return full.startsWith(root) ? full : null;
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  try {
    if (path === "/perf") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>loading</title><script type="module" src="/src/lab/perf-page.ts"></script>`,
      );
      return;
    }
    if (path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }
    let file: string | null = null;
    if (path.startsWith("/src/") && path.endsWith(".ts")) file = inside(SRC, path.slice(5));
    else if (path.startsWith("/fonts/")) file = inside(FONTS, path.slice(7));
    if (!file) throw new Error("not found");
    if (file.endsWith(".ts")) {
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(stripTypeScriptTypes(readFileSync(file, "utf8")));
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(Number(values.port), () => {
  console.log(`audio lab on http://localhost:${values.port}`);
});
