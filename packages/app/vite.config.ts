import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { execSync } from "node:child_process";

function gitSha(): string {
  try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return process.env.GITHUB_SHA?.slice(0, 7) ?? "dev"; }
}

// `vite build --mode single` inlines everything into dist-single/index.html (see build:single).
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    base: "./", // relative asset paths: works from file:// and any sub-path
    plugins: [react(), ...(single ? [viteSingleFile()] : [])],
    define: {
      __BUILD_SHA__: JSON.stringify(gitSha()),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    build: {
      outDir: single ? "dist-single" : "dist",
      chunkSizeWarningLimit: 1000,
      rollupOptions: single ? {} : {
        output: {
          manualChunks(id: string) {
            if (id.includes("node_modules/maplibre-gl")) return "maplibre";
            if (id.includes("node_modules/@deck.gl") || id.includes("node_modules/@luma.gl") || id.includes("node_modules/@math.gl") || id.includes("node_modules/@loaders.gl") || id.includes("node_modules/@probe.gl")) return "deckgl";
            if (id.includes("node_modules/react") || id.includes("node_modules/scheduler") || id.includes("node_modules/zustand")) return "react";
          },
        },
      },
    },
  };
});
