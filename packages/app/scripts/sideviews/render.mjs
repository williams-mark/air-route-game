// Renders every spec in fleet/*.mjs to public/aircraft/<id>.svg and lists the ids in src/aircraft/drawings.json.
// Usage: pnpm --filter @arg/app sideviews   (--out DIR renders elsewhere without touching the manifest; --only id1,id2)
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jet } from "./jet.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(here, "../../public/aircraft");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
mkdirSync(outDir, { recursive: true });
const all = {};
for (const f of readdirSync(join(here, "fleet")).filter((x) => x.endsWith(".mjs")).sort()) Object.assign(all, ...Object.values(await import(join(here, "fleet", f))));
let n = 0;
const ids = [];
for (const [id, spec] of Object.entries(all)) {
  if (only && !only.includes(id)) continue;
  const svg = spec.draw ? spec.draw({ id, ...spec }) : jet({ id, ...spec });
  writeFileSync(join(outDir, `${id}.svg`), svg.replace(/(\d+\.\d)\d+/g, "$1"));
  ids.push(id);
  n++;
}
if (!only && !args.includes("--out")) writeFileSync(join(here, "../../src/aircraft/drawings.json"), JSON.stringify(ids.sort(), null, 1) + "\n");
console.log(`${n} drawings -> ${outDir}`);
