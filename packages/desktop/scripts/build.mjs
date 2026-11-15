import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  // steamworks.js is a native module: shipped as a real dependency, never bundled.
  external: ["electron", "steamworks.js"],
  sourcemap: true,
  logLevel: "info",
};
await build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs" });
await build({ ...common, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs" });
