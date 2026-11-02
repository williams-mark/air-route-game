// Usage: node scripts/screenshots.mjs   (needs playwright resolvable; uses the pre-installed Chromium)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require.resolve("playwright", { paths: [process.cwd(), "/usr/lib/node_modules", "/usr/local/lib/node_modules"] }))); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "screenshots");
mkdirSync(outDir, { recursive: true });
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
try {
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    await page.goto(`${url}?theme=${theme}&t=420`);
    await page.waitForFunction(() => window.__argMap && window.__argMap.loaded(), null, { timeout: 20000 });
    await page.getByRole("button", { name: "Pause" }).click(); // freeze aircraft for stable shots
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
