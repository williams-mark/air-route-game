// Renders the steamcmd build scripts into steam/out/ and prints the steamcmd command.
// Env: STEAM_APP_ID, STEAM_DEPOT_ID, STEAM_USERNAME. Optional: STEAM_BUILD_DESC.
// `--run` executes steamcmd (must be on PATH). No password is read or stored: steamcmd prompts for it
// (or uses its cached login) itself. Package first: pnpm desktop:dist
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const steamDir = path.join(pkgDir, "steam");
const outDir = path.join(steamDir, "out");
const contentRoot = process.env.STEAM_CONTENT_ROOT || path.join(pkgDir, "release", "win-unpacked");
const run = process.argv.includes("--run");

const need = (name, re) => {
  const v = process.env[name]?.trim();
  if (!v || !re.test(v)) {
    console.error(`Set ${name} in the environment${v ? ` (invalid value)` : ""}.`);
    process.exit(1);
  }
  return v;
};
const appId = need("STEAM_APP_ID", /^[0-9]{1,10}$/);
const depotId = need("STEAM_DEPOT_ID", /^[0-9]{1,10}$/);
const username = need("STEAM_USERNAME", /^[A-Za-z0-9_.@-]{1,64}$/);
const version = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")).version;
const description = (process.env.STEAM_BUILD_DESC ?? `Air Route Game ${version}`).replace(/["\\]/g, "");

if (!existsSync(path.join(contentRoot, "Air Route Game.exe"))) {
  console.error(`Packaged game not found in ${contentRoot}. Run: pnpm desktop:dist`);
  process.exit(1);
}

const values = {
  APP_ID: appId,
  DEPOT_ID: depotId,
  DESCRIPTION: description,
  CONTENT_ROOT: contentRoot,
  BUILD_OUTPUT: path.join(outDir, "logs"),
};
const render = (name) => {
  let text = readFileSync(path.join(steamDir, name + ".template"), "utf8");
  for (const [k, v] of Object.entries(values)) text = text.replaceAll(`{{${k}}}`, v.replaceAll("\\", "\\\\"));
  return text;
};
mkdirSync(path.join(outDir, "logs"), { recursive: true });
const appVdf = path.join(outDir, "app_build.vdf");
writeFileSync(appVdf, render("app_build.vdf"));
writeFileSync(path.join(outDir, "depot_build.vdf"), render("depot_build.vdf"));

const args = ["+login", username, "+run_app_build", appVdf, "+quit"];
const quoted = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
console.log(`Rendered scripts into ${outDir}`);
console.log(`\nsteamcmd ${quoted}\n`);
if (!run) {
  console.log("Dry run. Add --run to execute it (steamcmd will ask for your password and Steam Guard code itself).");
} else {
  const r = spawnSync("steamcmd", args, { stdio: "inherit", shell: false });
  if (r.error) {
    console.error(`Could not start steamcmd (is it on PATH?): ${r.error.message}`);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
}
