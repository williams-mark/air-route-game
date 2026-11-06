# QA

## How to run
| What | Command | Typical time |
| --- | --- | --- |
| Unit, property/fuzz (includes `packages/sim/src/qa/fuzz.test.ts`) | `pnpm test` | about 1 min |
| Sim soak: 30 seeded 10-year bot games + invariants + determinism replay | `pnpm --filter @arg/sim soak` (options: `--games N --years Y --seed S --det K`) | about 13 min (about 4 s per game-year-batch when the machine is idle; the first run overlapped other jobs) |
| Browser e2e smoke, both themes | `pnpm --filter @arg/app e2e` (options: `--theme dark`, `--url http://host:port/` to use a running server) | about 3.3 min |
| Everything the rules require | `pnpm typecheck && pnpm test && pnpm build` | |

e2e uses the pre-installed `playwright` and Chromium (SwiftShader flags as in `scripts/screenshots.mjs`) and starts its own vite on port 5198. It loads `?nostart=1&seed=2015&theme=...&paused=1`, so it passes with or without the start screen. Screenshots go to `packages/app/screenshots/qa/` (git-ignored). CI: the `qa` job in `.github/workflows/ci.yml` installs playwright and Chromium (`playwright install --with-deps chromium`) only in CI, runs a reduced soak (6 games) and the e2e suite, and uploads the screenshots.

Soak invariants (`packages/sim/src/qa/invariants.ts`): no NaN/Infinity anywhere in SimState (deep scan, monthly); aircraft ids and tail numbers unique; route and order ids unique; every aircraft scheduled on a route can fly it (`typeCanServe`); no undelivered aircraft scheduled; order delivery days >= order day; aircraft not in service before delivery day; rival fleets and frequencies non-negative and bankrupt rivals own no aircraft; snapshot profit == revenue - costs every day; cash change == snapshot profit on every day without commands, deliveries or new orders; queue/history caps; determinism (first 3 games replayed, final-state JSON byte-identical).

Fuzz (`fuzz.test.ts`): 4 seeds x 400 random commands (openRoute, updateRoute, closeRoute, orderAircraft, acceptOffer, dismissOffer, refitAircraft) with about 30% invalid or non-finite arguments, interleaved with 20 days of stepping every 5 commands. Asserts: never throws, no non-finite values in state, every failure has a known typed error code and a message, a failed command leaves the world unchanged, structural invariants hold at the end.

## Results of the first run (2 Nov 2026, branch lane/qa)
- `pnpm typecheck`, `pnpm test` (data 12, sim 170 incl. 5 new fuzz tests, app 46), `pnpm build`: all pass.
- Soak: 30 games x 10 years, 6 strategies x 5 seeds (seeds 1-30). 0 invariant violations, 0 crashes. Cash identity checked on 109,292 quiet days, max error USD 0.0000. Determinism 3/3 replays byte-identical. Runtime total 799.6 s, mean 23.8 s, max 50.3 s per game (measured while other jobs shared the CPU, so the sim is faster than that on an idle machine).
- e2e: 32/32 checks pass (16 per theme) in 196 s, no console or page errors. Checks: boot and theme, all views key text, Offers tab, theme toggle changes CSS variables, command palette and shortcuts overlay, Space pause/resume and speed keys, route sandbox (SFO to SAN) then listed in Routes, duplicate route attempt, order 2 aircraft shows "0 of 2" pending and "on order" in Fleet, cabin designer, 90 simulated days at speed 5, date rate at speeds 1-4 within a tolerance band of the nominal 0.5/1/3/7 days per second.

## Maintenance switch (lane/nomaint)
Aircraft maintenance (A-D checks, deferral, heavy-check decision cards, per-hour maintenance cost line) is suspended with `MAINTENANCE_ENABLED = false` (`packages/sim/src/fleet/maintenance.ts`). Tests that exercise maintenance (`fleet.test.ts`, `planner.test.ts`, `economics.test.ts`, one scenario test) turn it on with `setMaintenanceEnabledForTests(true)`; `fleet/maintenanceOff.test.ts` checks a 3-year run has zero maintenance events. Manual checks while it is off: Fleet shows no "Next check" and no "In check" (only "Cabin refit"); Planner legend, aircraft panel and timeline show only refits, deliveries, pins and spares; Finance has no Maintenance column; no heavy-check card ever appears. The e2e suite has no maintenance expectations, so it is unchanged. When re-enabling, re-run bots, soak and this checklist.

## Bugs and observations
No failing invariant was found, and no game code was changed. Notes, by severity:

1. Medium (design gap, already in STATUS.md): the sim has no bankruptcy rule for the player. Bot games end with cash down to -3.0 B (yolo seed 28) and nothing happens; 23 of 30 games finished with negative cash (every strategy except passive; some greedy runs stay positive). Repro: `pnpm --filter @arg/sim soak --games 6 --years 10` and read "final cash". This hides balance problems from the soak.
2. Low (test gap): the e2e "duplicate route" check only verifies that the UI survives; it does not assert the error text, because the toast wording is not yet stable. Add a text assertion once the start-screen lane merges.
3. Low (e2e fragility): speed 5 for 90 days depends on the auto-slow hook not pausing the game. The test re-presses 5 and dismisses decision cards; if a modal decision type is added it may need updating.
4. Info: the e2e speed-rate check uses wall-clock time under SwiftShader; on a very slow CI runner raise the lower bound tolerance in `e2e/run.mjs`.
5. Info: dev-server-only run; the production build (`vite preview`) is not covered by e2e yet. Use `--url` to point at one.

Update (lane/qa-ui, 3 Nov 2026): bug 2 in this list still stands; the e2e suite now also covers modal focus trapping, narrow widths and the floating pills (see "UI QA checks" below). Save/load, the start screen and the rivals UI are implemented and have unit tests (app `saves.test.ts`, `realBridge.test.ts`, rivals `helpers.test.ts`) but still no e2e coverage of their flows.

Not tested by us: mobile devices (narrow desktop widths only), screen-reader behaviour, Safari/Firefox, bundle size (about 2 MB, known).

## UI QA checks (lane/qa-ui, from the independent SQA report of 2 Nov 2026)
- Supported sizes: desktop is the target; the minimum supported width is 360 px (usable, not designed for phones). Below 560 px the top bar becomes two rows (brand and icons, then date, cash, profit) and the toolbar narrows; below 900 px the sparkline and map side panel go away. Nothing may cause horizontal page scroll at 633x615, 390x844 or 360x740 in either theme.
- Floating controls: the time pill (bottom-right) and the collapsed notification pill (bottom-left) sit in a bottom strip of `--pill-clear` (5.25 rem) that every view reserves as bottom padding, so no button, input, heading or table row ends up under them when scrolled to the end at 1280x720, also at 125% UI scale. The full-width route panel at narrow widths stops above the strip.
- Modals: one shared `Modal` (`packages/app/src/shell/Modal.tsx`, logic in `focusTrap.ts`) is used by Save/Load, the cabin dialogs (Orders, Fleet, Planner), the command palette, the shortcuts overlay and the start screen. Tab and Shift+Tab cycle inside, everything else on the page is `inert` and `aria-hidden`, Escape and backdrop click close (not on the start screen) and focus returns to the opener.
- Automated: `pnpm --filter @arg/app e2e` has four focus-trap checks per theme, a narrow-width check (633, 390, 360) and a 1280x720 / 125% pill-overlap check; `focusTrap.test.ts` unit-tests the Tab-wrap rule. These e2e checks were verified to fail on the old CSS (the pill check found 3 overlaps).
- Fare-cut cards: each response shows an estimated weekly profit change and load factor (`sim/fareCut.ts`, unit-tested), and the card links to the route in Routes (opens its inspector). The estimate uses the route preview model as a relative yardstick only, so it inherits the preview-vs-live gap of SQA B02 and is labelled "est.".

## Open issues from the independent SQA report (2 Nov 2026, rating 6.5/10)
Fixed on lane/qa-ui: B07 narrow layouts, B08 time controls covering content, B09 modal focus, suggestion 5 (notification context), suggestion 8 (these docs). Still open, with owner lane where known:
- B01 P1 (FIXED, verified 5 Nov): a damaged save can replace the running game (serialize/realBridge; save lane).
- B02 P1: route-change profit deltas compare preview and live models (route preview helpers).
- B03 P1 design gap: no player bankruptcy or credit limit; 8 of 12 SQA games and 23 of 30 bot games end with negative cash.
- B04 P2: substituted aircraft use the requested type's economics (sim).
- B05 P2 (FIXED, verified 5 Nov): A220-100/300 and A350-1000 default cabins fail the cabin rules (cabin lane).
- B06 P2 (FIXED, verified 5 Nov): manufacturer discounts on regular orders have no lasting financial effect (sim).
- B10 P2 (FIXED, verified 5 Nov): refitting an unchanged cabin charges money and grounds the aircraft (cabin lane).
- B11 P3: planner header says 0 coverage issues while the Issues tab shows one structural gap.
- Not built: first-session tutorial (suggestion 2), goals and end-of-campaign review (4), hub/network board (6, T15), range and acquisition-terms explanations (7), fleet consequences before commitment (3).

## Manual SQA checklist (about 15 minutes, owner)
Open the game (`pnpm dev`), try both themes at each stage.
1. Boot (1 min): starts paused, 1 Jan 2015, cash about $150M, 4 routes visible on the map, no errors in the browser console.
2. Time (2 min): press 1 to 5 and watch the date speed up; Space pauses and resumes; + and - change speed; confirm the game does not pause when a delivery or decision arrives (auto-pause setting was removed).
3. Route creation (3 min): press N, type SFO then Enter, SAN then Enter, check the projection and why-ledger make sense, change frequency and fares, Open route. It shows in Routes and on the map. Try the same pair again (expect a clear error), try a pair too far for your aircraft, close a route and confirm.
4. Ordering (2 min): Orders / Offers, order 2 of a narrowbody, check the deposit equals 15% of the net price and cash drops, the order appears under Pending, Fleet shows it "on order". Try an order you cannot afford.
5. Offers (2 min): run at speed 5 for a year; an Offers badge appears; open the Offers tab, accept one and dismiss one, check cash and the new order.
6. Cabin designer (2 min): pick a narrowbody and a widebody, change class sliders, check seat count and warnings; use Design cabin in the order form; refit an existing aircraft from Fleet and confirm downtime and cost.
7. Rivals (2 min): open the Rivals view, pick a rival, check its markets; in a route inspector check the competition block; turn on Show competitors on the map; when a rival fare-cut card appears check each response shows an estimate and "Show this route in Routes" opens the inspector.
8. Finance (1 min): after a few months the charts show revenue, costs and profit; check y-axis labels are not clipped.
9. Light/dark and zoom (1 min): toggle the theme from the top bar and Settings; zoom the map from far to near (labels, airports, aircraft glyphs); try UI scale in Settings and a 1280x720 window (check toasts do not hide page headers, a known issue); resize to 633x615 and 390x844: no horizontal scroll, header readable, Settings controls stack.
9b. Keyboard (1 min): Settings, Save...; Tab and Shift+Tab never leave the dialog, Escape closes it and focus is back on the Save button; same for Ctrl+K and a cabin dialog.
10. Fleet planner (2 min): open Planner (Alt+4) on `?fleetdemo&ff=120`; switch horizons and light/dark, hover bars for tooltips, open an issue's Suggested cover and Apply it (a pin icon bar appears, the issue shrinks), pin an aircraft from its panel, reserve a spare, reorder a route's fallback types; arrow keys move between aircraft rows.
11. Pacific Northwest (2 min, lane/orwa): on the map use the California, Oregon/Washington, Hawaii and All buttons (and "Map: show ..." in the command palette); All must show Seattle at the top, San Diego at the bottom and Hawaii at the left, the OR/WA land filled like CA (focus colour) and nothing clipped under the HUD. Open routes SEA-PDX (land: ground damping, modest demand), SFO-SEA, SEA-HNL (overwater: E175/CRJ/ATR must be refused) and SEA-PAE (same metro, small share). Airport pickers show e.g. "Seattle-Tacoma Intl, Washington". Rival news should mention Seattle/Portland routes and Cascade Connect launching around mid 2015.

## World playtest (lane/world-int, 3 Nov 2026)
Run `node packages/app/scripts/playtest.mjs [--hub LHR --name "Thames Air"] [--routes LAX-JFK,...] [--order 0] [--days 90]` (starts its own vite on a free port; screenshots in packages/app/screenshots/playtest or `--out`). Checked: start screen hub and name, seven cross-world routes, previews, Routes/Fleet/Planner/Rivals/Finance/Orders views, map arcs, console clean. Findings and fixes are in STATUS.md "World integration lane". Manual checks to add to the SQA list: start a game at ANC and at LHR and open one route each; open FRA-BER before and after 31 Oct 2020; open a transatlantic route with a B737-800 and expect the overwater message.
