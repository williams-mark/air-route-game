import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flag = process.argv[2];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (flag === "--dev") env.ARG_DEV_URL ??= "http://localhost:5173";
if (flag === "--smoke") env.ARG_SMOKE = "1";

const sh = (cmd, args) => spawnSync([cmd, ...args].join(" "), { cwd: pkgDir, stdio: "inherit", shell: true });
if (flag !== "--dev" && !existsSync(path.join(pkgDir, "../app/dist/index.html"))) {
  console.log("App build missing; building @arg/app...");
  if (sh("pnpm", ["--filter", "@arg/app", "build"]).status !== 0) process.exit(1);
}
if (sh("pnpm", ["run", "build"]).status !== 0) process.exit(1);

const electronPath = createRequire(import.meta.url)("electron");
const child = spawn(electronPath, ["."], { cwd: pkgDir, stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
