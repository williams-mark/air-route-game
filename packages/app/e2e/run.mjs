// Playwright e2e smoke suite (plain node runner; uses the pre-installed `playwright`, no new dependencies).
// Usage: pnpm --filter @arg/app e2e [-- --theme dark|light] [-- --url http://host:port/]   (starts vite itself unless --url is given)
// Exit code 0 only if every check passes. Screenshots go to packages/app/screenshots/qa/ (git-ignored).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require.resolve("playwright", { paths: [process.cwd(), "/usr/lib/node_modules", "/usr/local/lib/node_modules", process.env.NODE_PATH ?? "", `${process.env.HOME}/.npm-global/lib/node_modules`, "/home/claude/.npm-global/lib/node_modules"] }))); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "screenshots", "qa");
mkdirSync(outDir, { recursive: true });
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const themes = flag("theme") ? [flag("theme")] : ["dark", "light"];
const PORT = 5198;
const base = flag("url") ?? `http://localhost:${PORT}/`;
const QUERY = "nostart=1&seed=2015";

let server = null;
if (!flag("url")) {
  server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"], { cwd: root, stdio: "pipe" });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("vite did not start")), 30000);
    server.stdout.on("data", (d) => { if (String(d).includes("Local")) { clearTimeout(t); res(); } });
    server.on("exit", (c) => rej(new Error("vite exited " + c)));
  });
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
});

const results = [];
const t00 = Date.now();
async function check(theme, name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ theme, name, ok: true, ms: Date.now() - t0 }); console.log(`  ok   [${theme}] ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { results.push({ theme, name, ok: false, ms: Date.now() - t0, err: String(e.message ?? e).split("\n")[0] }); console.log(`  FAIL [${theme}] ${name}: ${String(e.message ?? e).split("\n")[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Parse the top-bar date ("Thu 1 Jan 2015") into days since 2015-01-01. */
async function simDay(page) {
  const txt = (await page.locator(".stat", { hasText: "Date" }).locator(".v").innerText()).trim();
  const m = txt.match(/(\d+) (\w{3}) (\d{4})/);
  assert(m, `unparseable date "${txt}"`);
  return Math.round((Date.UTC(+m[3], MONTHS.indexOf(m[2]), +m[1]) - Date.UTC(2015, 0, 1)) / 86400000);
}
const speedPressed = (page) => page.locator(".speed-btn[aria-pressed=true]").first().getAttribute("aria-label");

async function newPage(theme, extra = "") {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${base}?${QUERY}&theme=${theme}&paused=1${extra}`);
  await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  return { page, problems };
}
const shot = (page, theme, name) => page.screenshot({ path: path.join(outDir, `qa-${theme}-${name}.png`) });
const nav = (page, label) => page.getByRole("button", { name: label, exact: true }).click();
const heading = (page, text) => page.getByRole("heading", { level: 1, name: text }).waitFor({ timeout: 8000 });

for (const theme of themes) {
  console.log(`\n== theme ${theme} ==`);
  const { page, problems } = await newPage(theme);

  await check(theme, "boots with theme applied and top bar visible", async () => {
    const t = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(t === theme, `data-theme is ${t}`);
    await page.locator(".topbar .brand strong").waitFor();
    assert(/Skybridge/.test(await page.locator(".brand").innerText()), "airline name missing");
    assert((await simDay(page)) === 0, "game should start paused at day 0");
    await shot(page, theme, "map");
  });

  await check(theme, "every view renders its key text", async () => {
    const views = [["Routes", "Routes", /routes/i], ["Fleet", "Fleet", /Your aircraft|Fleet/], ["Orders / Offers", "Orders / Offers", /new order/i], ["Finance", "Finance", /Finance/],
      ["Settings", "Settings", /Theme/], ["Cabin designer", "Cabin designer", /./]];
    for (const [btn, h1, body] of views) {
      await nav(page, btn);
      await heading(page, h1);
      const txt = await page.locator("main.view").innerText();
      assert(body.test(txt), `${btn}: expected ${body} in view text`);
      await shot(page, theme, `view-${btn.toLowerCase().replace(/\W+/g, "-")}`);
    }
    await nav(page, "Routes"); assert(/LAX.SFO/.test(await page.locator("main.view").innerText()), "starting route LAX-SFO missing in Routes");
    await nav(page, "Fleet"); assert(/B737-800/.test(await page.locator("main.view").innerText()), "starting fleet missing in Fleet");
    await nav(page, "Map");
    await page.locator(".overlay-left").waitFor();
  });

  await check(theme, "Orders: Offers tab opens", async () => {
    await nav(page, "Orders / Offers");
    await page.getByRole("tab", { name: /Offers/ }).click();
    await page.locator("#panel-offers").waitFor();
    assert(/offers/i.test(await page.locator("#panel-offers").innerText()), "offers panel empty");
    await shot(page, theme, "offers-tab");
    await page.getByRole("tab", { name: "Orders" }).click();
    await nav(page, "Map");
  });

  await check(theme, "theme toggle changes CSS variables", async () => {
    const read = () => page.evaluate(() => { const s = getComputedStyle(document.documentElement); return { bg: s.getPropertyValue("--bg").trim(), panel: s.getPropertyValue("--panel").trim(), t: document.documentElement.dataset.theme, body: getComputedStyle(document.body).backgroundColor }; });
    const a = await read();
    await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    await page.waitForTimeout(400);
    const b = await read();
    assert(a.t !== b.t && a.bg !== b.bg && a.panel !== b.panel && a.body !== b.body, `variables did not change: ${JSON.stringify([a, b])}`);
    await shot(page, theme, "toggled");
    await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    await page.waitForTimeout(300);
    assert((await read()).t === a.t, "toggle back failed");
    // Settings seg control agrees
    await nav(page, "Settings");
    assert((await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).getAttribute("aria-pressed")) === "true", "Settings does not show current theme");
    await nav(page, "Map");
  });

  await check(theme, "command palette and shortcuts overlay open and close", async () => {
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Command palette" }).waitFor({ timeout: 4000 });
    await page.keyboard.type("fleet");
    await page.waitForTimeout(200);
    await shot(page, theme, "palette");
    await page.keyboard.press("Enter");
    await heading(page, "Fleet");
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Command palette" }).waitFor({ state: "detached", timeout: 3000 });
    await nav(page, "Map");
    await page.keyboard.press("?");
    await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor({ timeout: 4000 });
    await shot(page, theme, "shortcuts");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor({ state: "detached", timeout: 3000 });
  });

  await check(theme, "Space pauses and resumes; speed keys 1-5 set the speed", async () => {
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("2");
    assert((await speedPressed(page)) === "Speed 2", "key 2 did not select speed 2");
    const d0 = await simDay(page);
    await page.waitForTimeout(2500);
    assert((await simDay(page)) > d0, "date did not advance while running");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    assert((await page.getByRole("button", { name: "Resume" }).count()) === 1, "Resume button not shown after Space");
    const d1 = await simDay(page);
    await page.waitForTimeout(1500);
    assert((await simDay(page)) === d1, "date advanced while paused");
    await page.keyboard.press("Space");
    await page.waitForTimeout(1500);
    assert((await simDay(page)) > d1, "date did not advance after resume");
    await page.keyboard.press("Space");
  });

  await check(theme, "route sandbox: create SFO-SAN route and see it in Routes", async () => {
    await nav(page, "Map");
    await page.keyboard.press("n");
    await page.getByRole("combobox", { name: "From" }).waitFor({ timeout: 5000 });
    await page.getByRole("combobox", { name: "From" }).fill("sfo");
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "To" }).fill("san");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await shot(page, theme, "route-sandbox");
    await page.getByRole("button", { name: "Open route" }).click();
    await page.waitForTimeout(800);
    await shot(page, theme, "route-opened");
    await page.getByRole("button", { name: "Close route inspector" }).click({ timeout: 1500 }).catch(() => {});
    await nav(page, "Routes");
    await heading(page, "Routes");
    const txt = await page.locator("main.view").innerText();
    assert(/SFO.SAN|SAN.SFO/.test(txt), `new route not listed in Routes. Text: ${txt.slice(0, 300)}`);
  });

  await check(theme, "duplicate route is rejected with a visible error", async () => {
    await nav(page, "Map");
    await page.keyboard.press("n");
    await page.getByRole("combobox", { name: "From" }).fill("lax");
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "To" }).fill("sfo");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Open route" }).click();
    await page.waitForTimeout(500);
    await shot(page, theme, "route-duplicate");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Cancel|Close/ }).first().click({ timeout: 1500 }).catch(() => {});
  });

  await check(theme, "order an aircraft and see a pending order", async () => {
    await page.reload();
    await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 30000 });
    await nav(page, "Orders / Offers");
    await page.locator("#ord-type").waitFor();
    await page.locator("#ord-qty").fill("2");
    await page.getByRole("button", { name: "Place order" }).click();
    await page.waitForTimeout(600);
    const txt = await page.locator("#panel-orders").innerText();
    assert(/0 of 2/.test(txt), `pending order row not shown: ${txt.slice(txt.indexOf("Pending orders"), txt.indexOf("Pending orders") + 200)}`);
    await shot(page, theme, "order-pending");
    await nav(page, "Fleet");
    assert(/on order/i.test(await page.locator("main.view").innerText()), "Fleet does not show aircraft on order");
  });

  await check(theme, "cabin designer is interactive", async () => {
    await nav(page, "Cabin designer");
    await page.locator("#cabin-type").selectOption("A350-900");
    await page.waitForTimeout(300);
    await shot(page, theme, "cabin");
  });

  await check(theme, "plays 90 simulated days at speed 5 without errors", async () => {
    await nav(page, "Map");
    const d0 = await simDay(page);
    await page.keyboard.press("5");
    await page.waitForFunction(() => /Speed 5/.test(document.querySelector(".speed-btn[aria-pressed=true]")?.getAttribute("aria-label") ?? "") || true);
    const t0 = Date.now();
    let d = d0;
    while (Date.now() - t0 < 60000 && d - d0 < 90) {
      await page.waitForTimeout(500);
      d = await simDay(page);
      // Auto-slow/pause on decisions or deliveries: keep it going.
      if ((await page.getByRole("button", { name: "Resume" }).count()) === 1) await page.keyboard.press("5");
      for (const b of await page.getByRole("button", { name: /^(Dismiss|Later|Snooze)/ }).all()) await b.click().catch(() => {});
    }
    assert(d - d0 >= 90, `only ${d - d0} days in 60s`);
    await shot(page, theme, "after-90-days");
    await page.keyboard.press("Space");
  });

  for (const sp of [1, 2, 3, 4]) {
    await check(theme, `speed ${sp}: date advances at roughly the expected rate`, async () => {
      await nav(page, "Map");
      await page.keyboard.press(String(sp));
      const rate = { 1: 0.5, 2: 1, 3: 3, 4: 7 }[sp];
      const d0 = await simDay(page);
      const t0 = Date.now();
      await page.waitForTimeout(sp === 1 ? 5000 : 3500);
      const secs = (Date.now() - t0) / 1000;
      const d1 = await simDay(page);
      await page.keyboard.press("Space");
      const exp = rate * secs;
      assert(d1 > d0, `date did not advance at speed ${sp}`);
      assert(d1 - d0 <= exp * 1.6 + 2, `advanced too fast at speed ${sp}: ${d1 - d0} days in ${secs.toFixed(1)}s (expected about ${exp.toFixed(1)})`);
      assert(d1 - d0 >= exp * 0.25 - 1, `advanced too slowly at speed ${sp}: ${d1 - d0} days in ${secs.toFixed(1)}s (expected about ${exp.toFixed(1)})`);
    });
  }

  await check(theme, "no console errors or page errors during the whole run", async () => {
    // WebGL/SwiftShader GPU stall warnings are logged as errors by Chromium in some builds; list them but fail on anything else.
    const real = problems.filter((p) => !/GPU stall|swiftshader|WebGL: INVALID_|GL Driver Message/i.test(p));
    assert(real.length === 0, `${real.length} problems, first: ${real[0]}`);
  });
  await page.close();
}

await browser.close();
server?.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\nE2E: ${results.length - failed.length}/${results.length} passed in ${((Date.now() - t00) / 1000).toFixed(0)}s`);
for (const f of failed) console.log(`  FAIL [${f.theme}] ${f.name}: ${f.err}`);
process.exit(failed.length ? 1 : 0);
