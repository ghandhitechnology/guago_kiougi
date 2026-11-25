/**
 * Screenshots of every admin screen in a real browser, against the running admin page and the
 * server the seed started (`seed.ts`).
 *
 *   node tools/moderation-run/src/shots.ts --page http://127.0.0.1:5208 --out <dir>
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    page: { type: "string", default: "http://127.0.0.1:5208" },
    out: {
      type: "string",
      default: path.resolve(import.meta.dirname, "../../../.local/admin-shots"),
    },
  },
});
const PAGE = values.page as string;
const OUT = values.out as string;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

let loads = 0;
async function shot(name: string, hash?: string, ready?: (p: Page) => Promise<void>) {
  if (hash !== undefined) {
    // A new query string forces a full load; a hash change alone would keep the old screen.
    await page.goto(`${PAGE}/?v=${++loads}#/${hash}`);
    await page.waitForSelector("main h1");
  }
  await ready?.(page);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`${name}.png`);
}

const playerHash = async (name: string) => {
  await page.goto(`${PAGE}/#/players?q=${encodeURIComponent(name)}`);
  const link = page.getByRole("link", { name, exact: true });
  await link.waitFor();
  return (await link.getAttribute("href"))?.replace("#/", "") ?? "";
};

await page.goto(PAGE);
await page.waitForSelector("input[name=loginId]");
await shot("01-login");
await page.fill("input[name=loginId]", "andy");
await page.fill("input[name=password]", "correct horse battery");
await page.click("button[type=submit]");
await page.waitForSelector("main h1");

await shot("02-players", "players");
const spam = await playerHash("도배왕");
await shot("03-player-muted", spam);
await shot("04-player-banned", await playerHash("물리덕후"));
const since = new Date(Date.now() - 3 * 3600_000).toISOString();
await shot("05-chat", `chat?from=${encodeURIComponent(since)}`);
await shot("06-reports", "reports");
await page.goto(`${PAGE}/#/reports`);
await page.waitForSelector("main table");
const first = await page.locator("main tbody tr td a").first().getAttribute("href");
await shot("07-report", first?.replace("#/", "") ?? "reports");
await shot("08-filter", "filter", async (p) => {
  await p.fill("input[name=text] >> nth=0", "시 발 진짜 렉 심하네 ㅅㅂ");
  await p.click("form button:has-text('Test')");
  await p.waitForSelector("text=shown as");
});
await shot("09-economy", "economy");
await shot("10-trades", "trades");
await shot("11-audit", "audit");
await shot("12-notice", "notice");
await shot("13-admins", "admins");

await browser.close();
if (errors.length > 0) {
  console.error(`page errors:\n${errors.join("\n")}`);
  process.exitCode = 1;
}
