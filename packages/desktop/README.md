# @arg/desktop

Electron shell for Air Route Game (first step of the Steam desktop port). It wraps the built output of `packages/app` and does not modify it.

## Run

```
pnpm desktop                 # from repo root: builds the app if dist is missing, then launches
pnpm --filter @arg/desktop dev     # against the Vite dev server (ARG_DEV_URL, default http://localhost:5173)
pnpm --filter @arg/desktop smoke   # headless-ish check: loads, waits 5 s, prints title/console errors, exit 0/1
```

The game is served from the privileged scheme `app://game/` (not `file://`) so asset paths stay absolute and localStorage/IndexedDB have a stable origin. Path traversal is rejected. `ARG_DEV_URL` overrides this. `ARG_SMOKE=1` enables the smoke run. F11 toggles fullscreen. External http(s) links open in the system browser.

## Package

```
pnpm desktop:dist            # builds app + desktop, runs electron-builder --win dir
```

Output goes to `packages/desktop/release` (gitignored). `electron-builder.yml` also lists an `nsis` target; build it with `pnpm --filter @arg/desktop exec electron-builder --win nsis --config electron-builder.yml`. The app's `dist` is copied to `resources/game`. No code signing, auto-update or publishing.

`pnpm build` for this package only bundles main/preload with esbuild (`dist/main.cjs`, `dist/preload.cjs`); it never packages.

## Saves

Plain text files `<key>.json` in `<userData>/saves` (on Windows `%APPDATA%\Air Route Game\saves`; the name is set with `app.setName` in `main.ts`). Keys must match `/^[A-Za-z0-9_-]{1,64}$/`. Writes are atomic (temp file then rename).

## Bridge contract

`window.argDesktop` (see `src/bridge.ts`; `packages/app/src/platform/desktopBridge.ts` holds a matching copy):

- `version: string`
- `saves.list() / read(key) / write(key, text) / remove(key)`
- `window.isFullscreen() / setFullscreen(on) / quit()`
- `steam.available()` (false for now) / `steam.unlockAchievement(id)` (no-op, false). Steamworks arrives in a later lane.
