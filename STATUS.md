# Build status (update at the end of every work session)

Last updated: Mon 2 Nov 2026 (UTC morning). `main` passes typecheck, test (data 13, sim 197, app 82; on lane/nomaint) and build.
Last updated: Mon 2 Nov 2026 (UTC morning). `main` passes typecheck, test and build. lane/orwa: data 15, sim 191, app 82 tests.
lane/qa-save: data 15, sim 224, app 94; typecheck, test, build pass.

## Task table (T1-T18 from the Week-One Build Plan doc)
| Task | State | Notes |
| --- | --- | --- |
| T1 scaffold | done | pnpm workspaces, CI |
| T2 contracts | done | packages/contracts |
| T3 airports | done | 42 CA/HI airports, plus 18 OR/WA airports (lane/orwa), see packages/data/SOURCES.md |
| T4 aircraft | done | 29 types, verified against Wikipedia/Boeing docs; unverified items listed in SOURCES.md |
| T5 map shell | done | offline MapLibre+deck.gl, light/dark, semantic zoom |
| T6 route layers | done | arcs, aircraft glyphs, selection. Overlapping arcs and crude coastline remain |
| T7 demand/choice | done | packages/sim, see MODEL.md |
| T8 connections/hubs | done | hub connecting passengers in stepDay (route/network.ts), see MODEL.md 9a |
| T9 finance and time | done | ledger, clock, speeds 0-5 |
| T10 UI shell | done | top bar, toolbar, feed, decision cards, command palette |
| T11 route inspector/creation | done | sandbox, inspector, why-ledger lines |
| T12 fleet/order book/checks | done | orders with delivery delays, A-D checks, scheduler, Fleet/Orders views, cabin layout in order form and refits |
| T13 offers panel | done (lane/offers) | launch, end-of-life, flash-sale and used offers; Offers tab, popup, badge. See MODEL.md "Offers" |
| T14 basic rivals | done (lane/saveui UI) | sim + Rivals view, competition block in route inspector, map competitor layer, rival fare-cut decision cards (match / partial + frequency / hold; one at a time) |
| T15 why ledger and hub board | partial | ledger in inspector; hub board not started |
| T16 save/load, cabin sliders, light polish | done | Cabin sliders done: designer view, order and refit editors (lane/cabin, see MODEL.md "Cabin"); save/load done (lane/saveui): IndexedDB 5 slots + autosave (monthly, tab hide), Ctrl+S, export/import, start screen (skip with ?newgame/?seed/?nostart/?ff/?mock/?paused) |
| T17 QA and balance bots | done (first pass) | bots + BALANCE.md; soak (30 games), fuzz, Playwright e2e (32/32), QA.md with manual checklist. Open: no player bankruptcy rule; save/load, start screen and rivals UI not in e2e |
| T18 deploy and hardening | partly done (lane/ship) | manualChunks vendor split, build:single, deploy.yml, netlify.toml, DEPLOY.md, build stamp in Settings. Nothing deployed yet; needs Mark's Cloudflare secrets |

## Fleet planner notes (lane/planner)
- Planner view (toolbar, Alt+4, palette "Go to Planner"): swimlane timeline, Issues with suggested cover, route fallback types, aircraft panel. Sim side in packages/sim/src/planner, see MODEL.md "Fleet planner". `?fleetdemo` loads a 36-aircraft fleet.
- TODO for the uifix lane: the heavy-check decision card (app/src/sim/decisions.ts checkCard + shell/DecisionCard.tsx) should offer "Plan cover" calling `usePlanner.getState().focus(aircraftId)` (planner/store.ts opens the planner on that aircraft).
- Data limit: widebodies cannot serve OGG (runway 2133 m vs 2650-3200 m needed), so LAX-OGG cannot be swapped to an A330 by any means; the planner shows the reason in the pin list.

## Maintenance suspended (lane/nomaint)
- `MAINTENANCE_ENABLED = false` in packages/sim/src/fleet/maintenance.ts suspends A-D checks, check clocks, deferrals, heavy-check decision cards, check costs and the per-hour maintenance ledger line. Flip to `true` to bring it all back; nothing was deleted. Cabin refits still work (own downtime and cost, no check slot). Details: MODEL.md section 7, QA.md "Maintenance switch".
- Tests that exercise maintenance switch it on with `setMaintenanceEnabledForTests(true)` (fleet, planner, economics, one scenario test); `fleet/maintenanceOff.test.ts` covers the off state (3-year run, zero events).
- App hides it when off: heavy-check cards, Planner B/C/D/A legend entries, Fleet "Next check" and "In check" wording, Finance Maintenance column. Planner keeps assignments, deliveries, pins, spares and coverage gaps from deliveries and refits.
- Balance: removing maintenance raises margins slightly (see BALANCE.md note); re-run bots and soak when re-enabling.

## Known issues to fix next
- Player bankruptcy rule missing (QA.md bug 1): 23 of 30 bot games end with negative cash and nothing happens.
- Hub board (T15) not built. First-party SQA by the owner is next: follow the checklist in QA.md.
- Rivals UI not wired (market view of competitors, rival news cards); bankruptcies rare in normal play, so few distressed lots (see RIVALS.md).
- Save/load (IndexedDB), hub board, QA Playwright smoke tests, deploy not started. Sim still on main thread.
- Rival bankruptcies: only Ember Air fails in the seed-2015 baseline; consider shocks (2020 pandemic is not modelled).
- Balance lane (see packages/sim/BALANCE.md): rivals do not react to player fares; no bankruptcy rule in the sim; no pandemic shock.
- Balance lane changed the starting fleet to 8 aircraft (3x 737-800, A320, 2x 757, 2x 777) and edited two app tests (realBridge.test.ts) that depended on the old LAX-SAN bug and the 13-aircraft fleet.
- Sim runs on the main thread (about 0.9 ms/day); move to a Web Worker later.
- Bundle split into react/maplibre/deckgl/app chunks (T18); initial load still fetches all since the map is the home view.
- Toasts overlap page headers on non-map views; Finance cash chart y-axis labels may clip.
- Decision cards expire after 45 days.

## Offers lane notes
- Ownership cost scales by net price / list (`ownershipFactor`) for offer orders and, since lane/qa-save, for ordinary orders too (volume discount 8-40% now lowers daily cost).
- Used/distressed aircraft arrive with age and hours but their check clocks start fresh.
- Offer popup has no screenshot yet (screenshots.mjs captures the Offers tab only).

## Usage rules from the owner
Mon afternoon/evening: keep about 30% free. Tue: unrestricted. Wed: none. Thu: after 3pm Pacific only. Fri-Sun: up to 80%. Finish early with cheaper models; quality can be revised later.

## Cabin lane notes
- Default layouts now validate for every type (A220 5-abreast, A350-1000 9-abreast); `fleet/layout.ts validateLayout` delegates to `cabin/rules.ts`, so orders, offers, refits and the designer share one rule set.
- Cabin geometry values are estimates (header of packages/sim/src/cabin/geometry.ts).
- Merge points: index.ts (export cabin, stepDay refit message), routeModel simulateRouteWeek (quality, fill ratios, cabinCost), ledger CabinInput.fillWeight and RouteInputs.cabinCost, commands.ts AnyCommand.

## Save/UI lane notes
- Save envelope in packages/sim/src/serialize.ts (SAVE_VERSION 1); bridge extras (feed, ledger, pending cards, decision engine) saved beside SimState. Loading starts paused.
- Screenshots: `node scripts/screenshots.mjs --saveui` (saveui-* files).
- Known: toasts overlap page headers; Delete-slot not offered; no Web Worker yet; extras are now validated (lane/qa-save).

## UIFIX lane notes (lane/uifix)
- Owner play-test feedback: AircraftPicker tile browser (manufacturer > family > variant, `packages/app/src/aircraft/`, `familyOf` in families.ts) replaces every type dropdown (orders, route sandbox, cabin designer, route swap); remembers last choice per picker in localStorage.
- Route inspector has an Aircraft section with guided type swap (updateRoute typeId, live projection, no-owned-aircraft warning and order link); also Routes table row action and command palette entries.
- Notification dock (`packages/app/src/notify/`) replaces EventFeed, Decisions and OfferPopup: draggable, minimizable, J toggles, Esc minimizes, corner and reset in Settings; auto-collapses to a pill on non-map views. Toasts are compact at top-center.
- Time controls are a floating pill at the bottom-right of the main area (class `time-pill`); date/cash/profit stay in the top bar.
- Screenshots: `node scripts/screenshots.mjs --uifix` (uifix-* files). Known: on non-map views an opened dock can cover the lower-left of page content; e2e speed-rate checks are timing-sensitive.

## Session note (post-playtest 1)
- Merged lane/uifix (aircraft picker tiles, route aircraft swap, notification dock, bottom-right time pill) and lane/planner.
- Runway rule: widebodies now use a stage-length requirement (`runwayRequiredM` in data, `simRunwayM` in sim) so A330/787 can serve OGG from the mainland; narrowbodies unchanged. 777s still cannot.
- Heavy-check decision cards link to the planner ("Plan cover in the planner").
- Open: hub board (T15), player bankruptcy rule, substituted-flight pricing uses requested type, dock may overlap planner's lower-right panel.

## Oregon/Washington lane notes (lane/orwa)
- Contracts: `Airport.region` is now "CA" | "HI" | "OR" | "WA" (first commit, contracts only).
- Data: 8 OR + 10 WA commercial-service airports (SEA PDX GEG BFI PAE BLI PSC EUG MFR RDM SLE OTH YKM ALW PUW LMT EAT PDT), generated by packages/data/scripts/gen_airports.py; sources and caveats in SOURCES.md. metroPopulation/gdp/tourism/slots are estimates; only SEA/PDX GDP has a fetched anchor.
- Region logic: `isLandPair` (data/geo.ts) = both ends in CA/OR/WA. `isOverwaterRoute` is false for any mainland pair and true mainland<->HI. sim `hasSurfaceAlternative` uses it (ground damping and the drive outside option now apply to CA-OR-WA pairs). Fuel: OR/WA priced like CA (no Pacific Northwest series). Random startup hubs may now be SEA/PDX.
- Demand: new Seattle metro in `DEFAULT_METROS` (SEA 0.88, PAE 0.08, BFI 0.04, tuning weights); Portland is single-airport so needs no entry. Calibration targets unchanged.
- Rivals: SFO-SEA/PDX for Pacific Crown, OAK/SAN-SEA/PDX for Kestrel, SMF/SJC-SEA/PDX for Sierra Jet, SFO-MFR/RDM/EUG/OTH for Golden State Express, plus a scheduled entrant Cascade Connect (regional, SEA/PDX, about mid 2015). LAX-SEA/PDX for Pacific Crown was dropped: the extra LAX connecting flow moved LAX-HNL yields enough to break the rival memory-relax test (test not loosened). The "five starting rivals" test is why Cascade Connect is an entrant, not a sixth starting airline.
- Map: new "Oregon/Washington" camera preset; "Both" is now "All" (bounds extended north to 49.3). land.json now has WA and OR as focus land plus MT as context (rebuild with `node packages/app/scripts/build-geo.mjs`). pickHubs guarantees a hub per region.
- Open: no annual-passenger or elevation columns exist for any airport; PAE is playable from 2015 though its terminal opened in 2019; Canadian cross-border demand at BLI is not modelled.

## QA-save lane notes (lane/qa-save, from SQA report B01/B05/B06/B10)
- B01: `validateSimState` (sim/serialize.ts) checks types and references in the whole state; `validateExtras` (app realBridge.ts) checks feed, ledger, pending cards, engine. `loadGame` validates, trial-steps one day on the loaded state, then swaps; any failure restores the previous bridge fields and the error shows in the Save UI. Old layouts are checked structurally only, so saves with pre-fix 6-abreast A220 cabins still load.
- B05: A220 defaults 5-abreast (A220-100 112 seats, was 114), A350-1000 9-abreast; order, offer and refit all use the cabin rules. Test iterates all types (cabin/consistency.test.ts, cabin.test.ts).
- B06: regular orders set `ownershipFactor = net / list`. Bots (12 x 10y): passive 351/658M (was 335/616), greedy 311/399M (was 274/285), bankruptcies 8/12, exploits 0, no recalibration needed.
- B10: `refitAircraft` with an identical layout returns `no_change` (no cash, no downtime); CabinDialog `requireChange` disables Start refit in the Fleet view. The Planner view's refit dialog does not pass `requireChange` yet (planner lane): the command still rejects it with a toast.
