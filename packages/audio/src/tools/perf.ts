/**
 * `pnpm --filter @guago/audio perf [--out dir]` measures the library in headless Chromium:
 *
 * - frame intervals and long tasks with music, ambient and an effect every 80 ms, against the same
 *   page silent, at full speed and with the main thread throttled 4× (a mid-range phone);
 * - main-thread script time the audio adds, from Chromium's own counters;
 * - how much of a core the audio worker uses;
 * - that a song rendered in the browser's JS engine matches the Node render the WAV files come from.
 *
 * Uses the lab server on port 4312, starting it if it is not running.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { SONGS } from "../content/index.ts";
import { compileSong } from "../tracker/compile.ts";
import { SongPlayer } from "../tracker/player.ts";
import { fingerprint } from "./fingerprint.ts";

const { values } = parseArgs({ options: { out: { type: "string" } } });
const URL_BASE = "http://localhost:4312";
const HERE = dirname(fileURLToPath(import.meta.url));

async function serverUp(): Promise<boolean> {
  try {
    return (await fetch(`${URL_BASE}/perf`)).ok;
  } catch {
    return false;
  }
}

let child: ReturnType<typeof spawn> | null = null;
if (!(await serverUp())) {
  child = spawn(process.execPath, [join(HERE, "../lab/server.ts")], { stdio: "ignore" });
  for (let i = 0; i < 50 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 100));
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const results: Record<string, unknown> = { browser: browser.version() };
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(m.text());
  });
  await page.goto(`${URL_BASE}/perf`);
  await page.waitForFunction(() => document.title === "ready");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");

  // Parity: the same song rendered by Chromium's V8 and by Node.
  const rate = 48000;
  const inBrowser = await page.evaluate((r) => window.perf.render("hub", 10, r), rate);
  const song = compileSong("hub", SONGS.hub);
  const out = Array.from({ length: song.stems.length * 2 }, () => new Float32Array(10 * rate));
  // Warm the JIT first, as the page's render was warmed by its own module load.
  const warm = new SongPlayer(song, rate);
  const scratch = Array.from({ length: out.length }, () => new Float32Array(4096));
  for (let i = 0; i < 100; i++) warm.render(scratch, 0, 4096);
  const t0 = performance.now();
  const player = new SongPlayer(song, rate);
  for (let i = 0; i < 10 * rate; i += 4096) player.render(out, i, Math.min(4096, 10 * rate - i));
  const nodeMs = performance.now() - t0;
  const inNode = fingerprint(out);
  results.parity = {
    identical: inBrowser.hash === inNode.hash,
    browserRms: inBrowser.rms,
    nodeRms: inNode.rms,
    browserRealtime: 10000 / inBrowser.ms,
    nodeRealtime: 10000 / nodeMs,
  };

  await page.evaluate(() => window.perf.unlock());
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);

  const metric = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const get = (n: string) => metrics.find((m) => m.name === n)?.value ?? 0;
    return { script: get("ScriptDuration"), task: get("TaskDuration") };
  };

  async function run(label: string, audioOn: boolean, seconds: number) {
    if (audioOn) {
      await page.evaluate(() => window.perf.start());
      await page.waitForTimeout(2500);
    }
    const before = await page.evaluate(() => window.perf.stats());
    const m0 = await metric();
    const { intervals, longTasks } = await page.evaluate(
      ([ms, every]) => window.perf.frames(ms, every),
      [seconds * 1000, audioOn ? 80 : 0] as const,
    );
    const m1 = await metric();
    const after = await page.evaluate(() => window.perf.stats());
    if (audioOn) await page.evaluate(() => window.perf.stop());
    await page.waitForTimeout(500);
    const row = {
      label,
      frames: intervals.length,
      p50: pct(intervals, 0.5),
      p95: pct(intervals, 0.95),
      p99: pct(intervals, 0.99),
      max: Math.max(...intervals),
      over33: intervals.filter((x) => x > 33.4).length,
      longTasks: longTasks.length,
      scriptMsPerSecond: ((m1.script - m0.script) * 1000) / seconds,
      taskMsPerSecond: ((m1.task - m0.task) * 1000) / seconds,
      workerShare: (after.workerMs - before.workerMs) / (seconds * 1000),
      lateBlocks: after.late - before.late,
      voicesStolen: after.stolen - before.stolen,
      state: after.state,
      sampleRate: after.sampleRate,
    };
    console.log(
      `${label.padEnd(26)} p50 ${row.p50.toFixed(1)} p95 ${row.p95.toFixed(1)} max ${row.max.toFixed(1)} ms · ` +
        `>33 ms ${row.over33} · long tasks ${row.longTasks} · script ${row.scriptMsPerSecond.toFixed(1)} ms/s · ` +
        `worker ${(row.workerShare * 100).toFixed(1)}% · late ${row.lateBlocks} · ${row.state} ${row.sampleRate} Hz`,
    );
    return row;
  }

  const rows = [];
  rows.push(await run("silent", false, 8));
  rows.push(await run("music+ambient+effects", true, 15));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  rows.push(await run("silent, 4x throttle", false, 8));
  rows.push(await run("audio, 4x throttle", true, 15));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  results.runs = rows;
  results.errors = errors;
  console.log(JSON.stringify(results.parity));
  if (errors.length) console.log(`page errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
  child?.kill();
}

if (values.out) {
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "perf.json"), JSON.stringify(results, null, 1));
}
