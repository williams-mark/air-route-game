# Steam release notes

The game runs fine without Steam. Steam is only switched on when an app id is configured (see below); there is no default id.

## Prerequisites (Steamworks partner account)

1. A Steamworks partner account with the Steam Direct fee paid and tax/bank details accepted.
2. Create the app on partner.steamgames.com (App Admin). Note the **App ID**.
3. Under *SteamPipe > Depots* create a Windows depot (OS: Windows 64-bit). Note the **Depot ID**. Add it to a package/branch in *SteamPipe > Builds* as needed.
4. Under *Installation > General* set the launch option: executable `Air Route Game.exe`, OS Windows.
5. Install steamcmd (https://developer.valvesoftware.com/wiki/SteamCMD) and put it on PATH. Use a dedicated builder account with the "Edit App Metadata" and "Publish App Changes To Steam" permissions.

## Auto-Cloud (saves)

No code is involved: saves are plain files in `%APPDATA%\Air Route Game\saves\*.json`. In *Application > Steam Cloud* (Edit Steam Cloud settings):

| Setting | Value |
| --- | --- |
| Byte quota per user | 10 MB (each save is small; 10 MB leaves room for 6 slots with history) |
| Number of files allowed per user | 20 |
| Root | `WinAppDataRoaming` |
| Subdirectory | `Air Route Game/saves` |
| Pattern | `*.json` |
| Recursive | off |
| OS | Windows |

Publish the Cloud settings, and check a real save grows well below the quota before shipping. The renderer writes atomically (temp file, then rename), so Steam never sees a half-written save in normal use. Temp files are not `.json` and are not synced.

## Achievements

Define each achievement in *Stats & Achievements > Achievements*. The **API Name** must equal the game's achievement id exactly (upper case letters, digits and underscore, up to 64 characters). The list lives in `packages/app/src/achievements/` (being added by another lane); copy the ids from there. Add name, description and 64x64 icons (locked and unlocked), then publish. The game calls `steam.unlockAchievement(id)`; unknown ids simply return false.

## Testing with a real app id

Only do this with your own app id, never with Valve's test id 480: Steam would show you as playing that game to your friends.

1. Steam client running and logged in as an account that owns the app (or is the developer).
2. Put the id in either place (both are gitignored/never committed):
   - env: `$env:ARG_STEAM_APP_ID = "<your id>"` then `pnpm desktop` (dev), or
   - a file `steam_appid.txt` (just the number) in `packages/desktop` for dev, or next to `Air Route Game.exe` for a packaged build.
3. Start the game. The log shows `[steam] initialised (app id from ...)`; if it says `disabled: init failed: ...` the message is Steam's reason (client not running, not owned, etc.).
4. Shift+Tab should open the overlay. Unlock an achievement in the game and check it in your Steam profile.
5. When the app id is configured and the build is packaged, starting the exe outside Steam makes Steam relaunch it (the standard `SteamAPI_RestartAppIfNecessary` check).

Do not ship `steam_appid.txt`: the upload script excludes it from the depot.

## Upload

1. `pnpm desktop:dist` (builds the app and packages `packages/desktop/release/win-unpacked`).
2. Set the environment (no password anywhere):
   ```
   $env:STEAM_APP_ID = "<app id>"; $env:STEAM_DEPOT_ID = "<depot id>"; $env:STEAM_USERNAME = "<builder account>"
   pnpm --filter @arg/desktop steam:upload
   ```
   This renders `app_build.vdf` and `depot_build.vdf` from the templates into `steam/out/` (gitignored) and prints the exact `steamcmd +login ... +run_app_build ... +quit` command. Optional `STEAM_BUILD_DESC` sets the build description.
3. Run the printed command yourself, or add `--run` to let the script do it (`pnpm --filter @arg/desktop steam:upload -- --run`). steamcmd asks for the password and Steam Guard code itself; this repo never stores either.
4. In *SteamPipe > Builds* set the build live on a branch (start with a private beta branch).

## Steam Deck

TODO: test at 1280x800, controller/touch input (no gamepad support yet), text size, verify the in-process-gpu/Chromium flags run under Proton, and decide on the Deck Verified checklist.
