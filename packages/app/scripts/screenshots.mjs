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
const onlyCabin = argv.includes("--cabin");
const onlySaveUi = argv.includes("--saveui");
const onlyUifix = argv.includes("--uifix");
const doMock = !onlyCabin && !onlySaveUi && !onlyUifix && (argv.includes("--mock") || !argv.includes("--real"));
const doReal = !onlyCabin && !onlySaveUi && !onlyUifix && (argv.includes("--real") || !argv.includes("--mock"));
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

/** Drive the AircraftPicker tile browser: manufacturer tile, family tile, variant tile. */
async function pickType(scope, man, fam, variant) {
  const tg = scope.locator(".ap-toggle");
  if ((await tg.getAttribute("aria-expanded")) !== "true") await tg.click();
  const all = scope.locator(".ap-nav button.ap-crumb", { hasText: "All" });
  if (await all.count()) await all.click();
  await scope.locator(".ap-tile", { hasText: man }).first().click();
  await scope.locator(".ap-tile", { hasText: fam }).first().click();
  await scope.locator(".ap-var", { hasText: variant }).first().click();
}
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

/** Cabin designer: narrowbody and widebody, plus the order and refit dialogs. */
async function cabinShots(theme) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(`${url}?theme=${theme}&t=420&paused=1&ff=30`);
  await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 20000 });
  await page.getByRole("button", { name: "Cabin designer" }).click();
  const snap = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(outDir, `cabin-${theme}-${name}.png`), fullPage: true }); console.log("saved cabin", theme, name); };
  await pickType(page.locator(".cabin-picker"), "Airbus", "A320 family", "A320neo");
  await page.getByRole("button", { name: "Standard" }).click();
  await snap("narrowbody");
  await pickType(page.locator(".cabin-picker"), "Airbus", "A350", "A350-900");
  await page.getByRole("button", { name: "Premium" }).click();
  await snap("widebody");
  await page.getByRole("button", { name: "Orders / Offers" }).click();
  await pickType(page.locator(".order-form .ap"), "Airbus", "A350", "A350-900");
  await page.getByRole("button", { name: /Design cabin/ }).click();
  await snap("order-dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fleet" }).click();
  await page.getByRole("button", { name: /Refit cabin of/ }).first().click();
  await snap("refit-dialog");
  if (problems.length) console.log("[cabin problems]", theme, problems.slice(0, 5));
  await page.close();
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
  await pickType(page.locator(".order-form .ap"), "Airbus", "A320 family", "A320neo");
  await page.locator("#ord-qty").fill("4");
  await snap("orders-form");
  await page.getByRole("button", { name: "Place order" }).click();
  await snap("orders");
  await page.getByRole("button", { name: "Finance" }).click();
  await snap("finance");
  if (problems.length) console.log("[real problems]", theme, problems.slice(0, 5));
  await page.close();
}

/** Start screen, save/load dialog, rivals view, competition block, competitor map layer. Run with --saveui. */
async function saveUiShots(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const problems = [];
  const open = async (query) => {
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
    page.on("pageerror", (e) => problems.push(e.message));
    await page.goto(`${url}?theme=${theme}&t=420${query}`);
    return page;
  };
  const snap = async (page, name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, `saveui-${theme}-${name}.png`) });
    console.log("saved saveui", theme, name);
  };
  // 1. Start screen with no saves.
  let page = await open("");
  await page.getByRole("dialog", { name: "Start screen" }).waitFor();
  await snap(page, "start-empty");
  await page.close();
  // 2. Play, save through the dialog, look at the rivals screens.
  page = await open(`&paused=1&ff=${process.env.ARG_FF ?? 91}`);
  await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Save\u2026" }).click();
  await snap(page, "save-dialog-empty");
  await page.getByRole("button", { name: "Save here" }).first().click();
  await page.getByRole("button", { name: "Overwrite" }).first().waitFor();
  await snap(page, "save-dialog-saved");
  await page.getByRole("tab", { name: "Load game" }).click();
  await snap(page, "load-dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Rivals" }).click();
  await snap(page, "rivals");
  await page.getByRole("button", { name: /Pacific Crown/ }).first().click();
  await snap(page, "rival-detail");
  await page.getByRole("button", { name: "Routes" }).click();
  await page.getByRole("button", { name: /Inspect LAX.SFO/ }).click();
  await page.getByRole("heading", { name: /Competition in this market/ }).scrollIntoViewIfNeeded();
  await snap(page, "competition-block");
  await page.getByRole("button", { name: "Close route inspector" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: /Show competitors/ }).click();
  await snap(page, "map-competitors");
  await page.close();
  // 3. Start screen with a save present (same browser profile -> same IndexedDB).
  page = await open("");
  await page.getByRole("button", { name: /Continue/ }).waitFor();
  await page.getByRole("button", { name: "Load slot" }).click();
  await snap(page, "start-continue");
  await page.close();
  if (problems.length) console.log("[saveui problems]", theme, problems.slice(0, 5));
  await ctx.close();
}

/** Aircraft picker levels, route aircraft swap, notification dock and time pill. Run with --uifix. */
async function uifixShots(theme) {
  const snap = async (page, name, opts = {}) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(outDir, `uifix-${theme}-${name}.png`), ...opts }); console.log("saved uifix", theme, name); };
  const problems = [];
  let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${url}?theme=${theme}&t=420&paused=1&ff=30&nostart=1`);
  await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await snap(page, "time-pill-map");
  // Picker levels in the order form
  await page.getByRole("button", { name: "Orders / Offers" }).click();
  const box = page.locator(".order-form .ap");
  await snap(page, "picker-0-closed");
  await box.locator(".ap-toggle").click();
  await box.locator(".ap-nav button.ap-crumb", { hasText: "All" }).click();
  await snap(page, "picker-1-manufacturers");
  await box.locator(".ap-tile", { hasText: "Boeing" }).first().click();
  await snap(page, "picker-2-families");
  await box.locator(".ap-tile", { hasText: "737 MAX" }).first().click();
  await snap(page, "picker-3-variants");
  await box.locator(".ap-tile", { hasText: "787" }).first().click().catch(() => {});
  // Route swap
  await page.getByRole("button", { name: "Routes" }).click();
  await snap(page, "routes-table");
  await page.getByRole("button", { name: /Change aircraft on LAX.SFO/ }).click();
  await page.waitForTimeout(600);
  await snap(page, "swap-open");
  const rp = page.locator(".route-panel");
  await rp.locator(".ap-nav button.ap-crumb", { hasText: "All" }).click();
  await rp.locator(".ap-tile", { hasText: "Airbus" }).first().click();
  await rp.locator(".ap-tile", { hasText: "A330" }).first().click();
  await rp.locator(".ap-var", { hasText: "A330-300" }).first().click();
  await page.waitForTimeout(700);
  await rp.locator("#rp-aircraft").scrollIntoViewIfNeeded();
  await snap(page, "swap-projection");
  await page.keyboard.press("Escape").catch(() => {});
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.close();

  // Notification dock on the mock (scripted decisions)
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${url}?mock=1&theme=${theme}&t=420&paused=1`);
  await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await snap(page, "dock-expanded");
  await page.getByRole("button", { name: "Open route inspector" }).count();
  const grip = page.getByRole("button", { name: /Move notifications/ });
  const gb = await grip.boundingBox();
  if (gb) {
    await page.mouse.move(gb.x + 8, gb.y + 8); await page.mouse.down(); await page.mouse.move(gb.x + 500, gb.y - 250, { steps: 8 }); await page.mouse.up();
    await snap(page, "dock-moved");
  }
  await page.keyboard.press("Escape");
  await snap(page, "dock-minimized");
  await page.keyboard.press("j");
  await page.getByRole("button", { name: "Routes" }).click();
  await snap(page, "dock-offmap-pill");
  await page.getByRole("button", { name: /Notifications, .* unresolved/ }).click();
  await snap(page, "dock-offmap-open");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.keyboard.press("Escape");
  await snap(page, "settings-dock");
  await page.close();
  if (problems.length) console.log("[uifix problems]", theme, problems.slice(0, 6));
}

try {
  if (onlyUifix) for (const theme of ["dark", "light"]) await uifixShots(theme);
  if (onlySaveUi) for (const theme of ["dark", "light"]) await saveUiShots(theme);
  if (doReal) for (const theme of ["dark", "light"]) await realShots(theme);
  if (doReal || argv.includes("--cabin")) for (const theme of ["dark", "light"]) await cabinShots(theme);
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
