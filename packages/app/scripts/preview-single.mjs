// Serves dist-single/ on http://localhost:4173/ (any static server works; the file also opens from file://).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist-single/index.html");
createServer(async (_req, res) => {
  try { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(await readFile(file)); }
  catch { res.writeHead(500); res.end("Run: pnpm --filter @arg/app build:single"); }
}).listen(4173, () => console.log("Single-file preview: http://localhost:4173/"));
