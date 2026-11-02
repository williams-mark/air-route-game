// Usage: node scripts/screenshots.mjs [--mock|--real]   (needs playwright resolvable; uses the pre-installed Chromium)
// --mock: fixture screenshots (ui-*, dark-*/light-*) against ?mock=1. --real: real-sim screenshots (real-*) after ~3 simulated months. Default: both.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require.resolve("playwright", { paths: [process.cwd(), "/usr/lib/node_modules", "/usr/local/lib/node_modules", process.env.NODE_PATH ?? "", `${process.env.HOME}/.npm-global/lib/node_modules`, "/home/claude/.npm-global/lib/node_modules"] }))); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "screenshots");
mkdirSync(outDir, { recursive: true });
const argv = process.argv.slice(2);
const doMock = argv.includes("--mock") || !argv.includes("--real");
const doReal = argv.includes("--real") || !argv.includes("--mock");
const PORT = 5199;
const url = `http://localhost:${PORT}/`;

const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"], { cwd: root, stdio: "pipe" });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("vite did not start")), 30000);
  server.stdout.on("data", (d) => { if (String(d).includes("Local")) { clearTimeout(t); res(); } });
  server.on("exit", (c) => rej(new Error("vite exited " + c)));
});

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const views = [
  { name: "1-far-both", center: null, preset: "Both" },
  { name: "2-mid-california", preset: "California" },
  { name: "3-near-la", jump: { center: [-118.15, 33.95], zoom: 9.4 } },
  { name: "4-mid-hawaii", preset: "Hawaii" },
];
const shellShots = [
  { name: "map", run: async () => {} },
  { name: "finance", run: async (page) => { await page.getByRole("button", { name: "Finance" }).click(); } },
  { name: "routes", run: async (page) => { await page.getByRole("button", { name: "Routes" }).click(); } },
  { name: "fleet", run: async (page) => { await page.getByRole("button", { name: "Fleet" }).click(); } },
  { name: "settings", run: async (page) => { await page.getByRole("button", { name: "Settings" }).click(); } },
  { name: "palette", run: async (page) => { await page.getByRole("button", { name: "Map", exact: true }).click(); await page.keyboard.press("Control+k"); await page.keyboard.type("go"); } },
  { name: "shortcuts", run: async (page) => { await page.keyboard.press("Escape"); await page.keyboard.press("?"); } },
];
const shot = async (page, theme, name) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(outDir, `ui-${theme}-1440-${name}.png`) });
  console.log("saved ui", theme, name);
};
const scrollPanel = (page, y) => page.locator(".rp-scroll").evaluate((el, top) => { el.scrollTop = top === "end" ? el.scrollHeight : top; }, y);

/** Route inspector and creation flow (1440x900). */
async function routeShots(page, theme) {
  await page.getByRole("button", { name: "Routes" }).click();
  await page.getByRole("button", { name: /Inspect LAX.SFO/ }).click();
  await shot(page, theme, "routes-inspector");
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await shot(page, theme, "inspector-map");
  await page.locator(".ledger-row").nth(5).focus();
  await scrollPanel(page, 360);
  await shot(page, theme, "inspector-ledger-tip");
  await scrollPanel(page, "end");
  await shot(page, theme, "inspector-adjust");
  await page.getByRole("button", { name: "Close route\u2026" }).click();
  await shot(page, theme, "inspector-confirm");
  await page.keyboard.press("Escape"); // closes the confirmation
  await page.getByRole("button", { name: "Close route inspector" }).click();
  // Creation flow
  await page.keyboard.press("n");
  await shot(page, theme, "create-empty");
  const from = page.getByRole("combobox", { name: "From" });
  await from.fill("sa");
  await shot(page, theme, "create-autocomplete");
  await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "To" }).fill("lih");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await shot(page, theme, "create-top");
  await scrollPanel(page, "end");
  await shot(page, theme, "create-projection");
  // Duplicate route -> typed error toast
  await page.getByRole("combobox", { name: "From" }).fill("lax");
  await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "To" }).fill("sfo");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Open route" }).click();
  await shot(page, theme, "create-error-toast");
  // Valid route -> success toast and inspector
  await page.getByRole("combobox", { name: "To" }).fill("bur");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Open route" }).click();
  await shot(page, theme, "create-opened");
  await page.getByRole("button", { name: "Close route inspector" }).click();
}

/** Real simulation after about three simulated months (ff=91 days). */
async function realShots(theme) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(`${url}?theme=${theme}&t=420&paused=1&ff=${process.env.ARG_FF ?? 91}`);
  await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const snap = async (name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, `real-${theme}-${name}.png`) });
    console.log("saved real", theme, name);
  };
  await snap("map");
  await page.getByRole("button", { name: "Routes" }).click();
  await snap("routes");
  await page.getByRole("button", { name: /Inspect LAX.SFO/ }).click();
  await snap("route-inspector");
  await page.getByRole("button", { name: "Close route inspector" }).click();
  await page.getByRole("button", { name: "Fleet" }).click();
  await snap("fleet");
  await page.getByRole("button", { name: "Orders" }).click();
  await page.getByRole("tab", { name: /Offers/ }).click();
  await snap("offers");
  await page.getByRole("tab", { name: "Orders" }).click();
  await page.locator("#ord-type").selectOption("A320N");
  await page.locator("#ord-qty").fill("4");
  await snap("orders-form");
  await page.getByRole("button", { name: "Place order" }).click();
  await snap("orders");
  await page.getByRole("button", { name: "Finance" }).click();
  await snap("finance");
  if (problems.length) console.log("[real problems]", theme, problems.slice(0, 5));
  await page.close();
}

try {
  if (doReal) for (const theme of ["dark", "light"]) await realShots(theme);
  if (doMock) for (const theme of ["dark", "light"]) {
    for (const [w, h] of [[1440, 900], [1280, 720]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });
      page.on("pageerror", (e) => console.log("[pageerror]", e.message));
      await page.goto(`${url}?mock=1&theme=${theme}&t=420&paused=1`);
      await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 20000 });
      await page.waitForTimeout(1500);
      for (const s of shellShots) {
        await s.run(page);
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outDir, `ui-${theme}-${w}-${s.name}.png`) });
        console.log("saved ui", theme, w, s.name);
        if (s.name === "palette" || s.name === "shortcuts") await page.keyboard.press("Escape");
      }
      if (w === 1440) await routeShots(page, theme);
      await page.close();
    }
  }
  if (doMock) for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    await page.goto(`${url}?mock=1&theme=${theme}&t=420&paused=1`);
    await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    for (const v of views) {
      if (v.preset) {
        await page.getByRole("button", { name: v.preset, exact: true }).click();
        await page.waitForTimeout(2600);
      } else if (v.jump) {
        await page.evaluate((j) => window.__argMap.jumpTo(j), v.jump);
        await page.waitForTimeout(1200);
      }
      if (v.name.startsWith("1-")) await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, `${theme}-${v.name}.png`) });
      console.log("saved", theme, v.name);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(0);
