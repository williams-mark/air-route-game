// Playtest of the expanded world through the UI (Playwright, pre-installed Chromium). Usage: node scripts/playtest.mjs [--hub LHR] [--out dir]
// Starts vite itself. Opens a list of routes in a fresh 2015 game, prints what the sandbox and inspector show, and fails on console errors.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require.resolve("playwright", { paths: [process.cwd(), "/usr/lib/node_modules", "/usr/local/lib/node_modules", process.env.NODE_PATH ?? "", `${process.env.HOME}/.npm-global/lib/node_modules`, "/home/claude/.npm-global/lib/node_modules"] }))); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const outDir = flag("out", path.join(root, "screenshots", "playtest"));
mkdirSync(outDir, { recursive: true });
const PORT = Number(flag("port", String(5300 + (process.pid % 600))));
const base = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"], { cwd: root, stdio: "pipe" });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("vite did not start")), 30000);
  server.stdout.on("data", (d) => { if (String(d).includes("Local")) { clearTimeout(t); res(); } });
  server.on("exit", (c) => rej(new Error("vite exited " + c)));
});
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const simDay = async () => { const m = (await page.locator(".stat", { hasText: "Date" }).locator(".v").innerText()).match(/(\d+) (\w{3}) (\d{4})/); return Math.round((Date.UTC(+m[3], MONTHS.indexOf(m[2]), +m[1]) - Date.UTC(2015, 0, 1)) / 86400000); };
const nav = (label) => page.getByRole("button", { name: label, exact: true }).click();
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const log = (...a) => console.log(...a);

const hub = flag("hub");
await page.goto(hub ? `${base}?theme=dark` : `${base}?nostart=1&seed=2015&theme=dark&paused=1`);
await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 30000 });
if (hub) {
  await page.locator("#start-hub").waitFor();
  await page.locator("#start-airline").fill(flag("name", "Playtest Air"));
  await page.locator("#start-hub").selectOption(hub);
  await page.screenshot({ path: path.join(outDir, "start-screen.png") });
  await page.getByRole("button", { name: "New game" }).click();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Space").catch(() => {});
  if ((await page.getByRole("button", { name: "Resume" }).count()) === 0) await page.keyboard.press("Space");
}
await page.waitForTimeout(800);

async function pickType(scope, man, fam, variant) {
  const tg = scope.locator(".ap-toggle");
  if ((await tg.getAttribute("aria-expanded")) !== "true") await tg.click();
  const all = scope.locator(".ap-nav button.ap-crumb", { hasText: "All" });
  if (await all.count()) await all.click();
  await scope.locator(".ap-tile", { hasText: man }).first().click();
  await scope.locator(".ap-tile", { hasText: fam }).first().click();
  await scope.locator(".ap-var", { hasText: variant }).first().click();
}

// 1) order two B787-9 first
if (flag("order", "1") === "1") {
await nav("Orders / Offers");
await page.locator(".order-form .ap-toggle").waitFor();
await pickType(page.locator(".order-form"), "Boeing", "787", "787-9");
await page.locator("#ord-qty").fill("2");
await page.getByRole("button", { name: "Place order" }).click();
await page.waitForTimeout(500);
log("ORDER:", (await page.locator("#panel-orders").innerText()).split("\n").filter((l) => /787/.test(l)).slice(0, 3).join(" | "));
await nav("Map");
}

const toasts = async () => (await page.locator(".toasts, [role=status]").allInnerTexts()).join(" ").replace(/\s+/g, " ").slice(0, 300);
async function open(from, to, opts = {}) {
  await nav("Map");
  await page.keyboard.press("n");
  const f = page.getByRole("combobox", { name: "From" });
  await f.waitFor({ timeout: 5000 });
  await f.fill(from); await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "To" }).fill(to); await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  if (opts.type) { await pickType(page.locator(".route-panel, .rp, aside").first(), ...opts.type); await page.waitForTimeout(600); }
  const panel = await page.locator("aside, .route-panel").first().innerText().catch(() => "");
  await shot(`sandbox-${from}-${to}`);
  const text = panel.replace(/\s+/g, " ");
  log(`\n== ${from}-${to} sandbox ==\n${text.slice(0, 900)}`);
  await page.getByRole("button", { name: "Open route" }).click();
  await page.waitForTimeout(900);
  log("after open, toasts:", await toasts());
  await shot(`opened-${from}-${to}`);
  await page.getByRole("button", { name: "Close route inspector" }).click({ timeout: 1500 }).catch(() => {});
}
const routes = (flag("routes", "LAX-JFK,JFK-LHR,LHR-CDG,FRA-MAD,ANC-FAI,SEA-ANC,HNL-OGG")).split(",").map((s) => s.split("-"));
for (const [a, b] of routes) { try { await open(a, b); } catch (e) { log(`FAILED ${a}-${b}:`, String(e.message).split("\n")[0]); await shot(`fail-${a}-${b}`); await page.keyboard.press("Escape"); } }

// run 3 months
await nav("Map");
await page.keyboard.press("5");
const d0 = await simDay();
const t0 = Date.now();
while (Date.now() - t0 < 90000 && (await simDay()) - d0 < Number(flag("days", 90))) {
  await page.waitForTimeout(500);
  if ((await page.getByRole("button", { name: "Resume" }).count()) === 1) await page.keyboard.press("5");
  for (const b of await page.getByRole("button", { name: /^(Dismiss|Later|Snooze)/ }).all()) await b.click().catch(() => {});
}
await page.keyboard.press("Space");
log("\nday", await simDay());
for (const v of ["Routes", "Fleet", "Planner", "Rivals", "Finance", "Orders / Offers"]) {
  await nav(v); await page.waitForTimeout(600);
  const txt = (await page.locator("main.view").innerText()).replace(/\s+/g, " ");
  log(`\n== ${v} ==\n${txt.slice(0, v === "Routes" || v === "Rivals" ? 2500 : 900)}`);
  await shot(`view-${v.replace(/\W+/g, "-")}`);
}
await nav("Map");
await shot("map-final");
log("\nPROBLEMS:", problems.filter((p) => !/GPU stall|swiftshader|WebGL: INVALID_|GL Driver Message/i.test(p)));
await browser.close();
server.kill();
