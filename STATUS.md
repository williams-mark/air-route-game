## lane/balance-calibration (pandemic, fuel, margins, used offers)
Answers the QA open items on balance. Details and sources: MODEL.md "Pandemic shock and margin calibration", fuel and offers sections.
- 2020-23 pandemic demand shock (`demand/pandemic.ts`, sourced anchors BTS/IATA, intra-year path and 2022-24 recovery are assumptions), five dated notices, off via `SimParams.pandemic=false` / `startingScenario(..., {pandemic:false})`; games starting after it are untouched. Passive airline revenue falls 45-55% in 2020.
- Fuel series now runs past 2040 (FRED annual means to 2025, BTS 2026, then +2%/yr, flagged as assumption). `corporateOverheadPerDay` 8,000 to 32,000. Used offers: about 6 a year (was about 24), max 5 open, discounts capped at 50% (launch deals 10-20%).
- Harness: `pnpm --filter @arg/sim balance -- --games 2 --years 15`. Passive bot margin mostly 7-19% outside 2020; aggressive "greedy" bot is erratic (-20% to +18%) and one seed goes bankrupt in 2022 after the pandemic.
- Approximations: West Coast fuel premium, within-year fuel shape, post-Oct-2026 fuel path, pandemic recovery curve, offer discount bands. Maintenance is still suspended; re-check margins when it returns.

## lane/fleet-sales (sell aircraft, return leases, fleet-diversity cost)
Answers the QA open items "no aircraft sale or early return" and "no cost for a mixed fleet". Details: MODEL.md.
- Sim: `sellAircraft` (owned outright, paid immediately; value = min(book, price paid rolled forward) x 0.88 x 0.92 widebody x 0.8 obsolete; refused on a route, leased, on order or in the hangar, or if it would shrink the credit line while cash is below zero) and `returnLease` (3 months of lease as a fee, `DISPOSAL_PARAMS.leaseTerminationMonths`; no lease end dates exist, so no fee-free return). Diversity overhead: types beyond 4 cost $250k + $14k per aircraft per extra type per month (about 1% of revenue at 5 types, 5% at 12); `SimState.diversity`.
- App: Sell / Return in Fleet rows and bulk bar with a confirm dialog, "Fleet types" panel and P&L column in Finance; distress banner mentions selling.
- Not done: settlement delay, fee-free return at lease end.

## lane/campaign-end (campaign length and end-of-campaign review)
Answers the QA open item "no end of campaign".
- Start screen "Campaign length" (10 / 15 / 25 / Endless, default 15). `SimState.campaign` (absent = endless, so old saves load endless). The sim pauses on 1 Jan of the end year and shows a once-only review: score (equity = cash + depreciated owned aircraft - purchase balances owed; grade A 3x start cash, B 2x, C 1x, D 0x, F below zero), profit by year, fleet, routes, rival rank. Keep playing (endless) / Load / New game. Not shown for a bankrupt game.
- Not done: 25-year games end in 2040, past the 2025 data range (untested); `validateSimState` does not check the campaign field.

## lane/ui-polish (names and sandbox)
- One short aircraft name everywhere (`typeShortName`: A321ceo, A320neo, B737-800). The route sandbox has a visible "Close sandbox" button that restores the prior speed; Escape closes it (an open airport dropdown takes Escape first).

## lane/credit-bankruptcy (credit line, order guard, distress, bankruptcy)
Answers the QA open item "no credit limit or bankruptcy" (cash had reached -$567M to -$727M with no consequence). Details and parameters: MODEL.md "Credit line, distress and bankruptcy".
- Sim: credit limit (base $25M + 50% of owned-aircraft value + 1.5 months of revenue), 8% daily-charged overdraft interest, order funding guard (`credit_limit`), distress (cash below minus the limit) with monthly reminders, bankruptcy after 90 days of distress (sim freezes, commands refused with `bankrupt`), `cancelOrder` command (forfeits deposit). No contracts change (state lives in `SimState.credit`, commands in sim's `FinanceCommand`).
- App: Finance "Credit line" panel and an Interest column, distress banner under the top bar, game-over card (load or new game; no autosave of a bankrupt game), order quote shows the credit line and sim's verdict and disables Place order when refused, Pending orders has a confirmed Cancel.
- Not done: aircraft sales (another lane; once a sell command exists it is a natural third cure), no distress surcharge rate, no rival-style forced liquidation, e2e not extended, offers (accept) are not funding-guarded because they owe nothing at delivery.

## lane/fare-swing (weekly target-load-factor fare controller)
- Cause: the weekly solve priced for the day's random demand noise and matched one day's seasonal demand exactly, ignoring that the fare holds a week. Now: expected demand at mid-week, seasonal swing followed 70%, fare moved 85% of the log gap per week, at most 8% a week (FARE_SOLVER_PARAMS in route/routeModel.ts, rationale in its comment). Tests: route/fareController.test.ts. Annual mean load factor within 1.5 points of target; seasonal load factor floats up to ~8 points (seasonalFollow 1 restores tracking at the cost of the old swings).

## lane/qa-playtest-fixes (two scripted 15-year playthroughs, 8-10 Nov 2026; app plus small sim message changes)
Two agents played 2015-2029 from LAX with no context beyond "build a semi-realistic airline" (one drove `RealSimBridge` from a script, one drove the UI with Playwright). Fixed here:
- Route creator: Enter in an untouched airport field kept the airport but used to take the list's first row (LAX became ATL); `resolveEnter` (routes/airportSearch.ts, tested). Open route is disabled, with the reason as its tooltip, when the pair is already flown, the draft is invalid or the origin hub lacks block hours (the preview said feasible, the command refused). "Use best" is capped to what the hub can fly and priced on the same live model as the headline, and is hidden when it is not better. The chart note says it is the standalone model.
- Hubs: "Unlock a hub" is the searchable airport field, not a 1,000-entry select.
- Money text: `usdM`/`usdK` (sim/src/money.ts) so refusals read "-$167.5M", not "$-167.5M"; the duplicate-route message no longer says "route route-1".
- Orders: quantity must be a whole number 1-max (no silent rounding of 2.5, 0 or -3); the quote shows the balances already owed at delivery on open purchase orders and cash after all of them (`orderExposure.ts`). The sim still does not check cash at delivery (see open).
- Feed: "Offer expired" and "Offer expiring soon" are quiet notices; the 60-item trim drops routine notices before alerts; the cash alert repeats monthly while overdrawn and says what to do. Dock pill no longer shows "0" next to "5 new".
- Fare policy: the route inspector shows the effective target and its source ("88% from fare policy ...") and warns that a typed fare will be overwritten weekly (`describeEffectiveTarget`).
- Decision cards: a frequency increase is offered only when the route's own forecast says it adds profit, and in steps of at most half the current frequency (no more "add 37 a week" on a 180 km route).
- Start screen: the hint no longer shifts the label grid; New game starts paused. Autosave also runs on `pagehide` (best effort). Cabin designer warns at 100% length. "Connections -0%" reads "Connections at full fare". Order and unlock inputs are themed in dark mode. Unused `COMMAND_PARAMS.depositFraction` (0.15) removed; the live deposit is `FINANCING_PARAMS.purchaseDownFraction` (20%).
- Gate: `pnpm install --frozen-lockfile`, typecheck, test (data 82, sim 382, app 202), build all green; e2e 48/48 (24 checks x 2 themes, no console errors). The Hubs e2e check now types the code into the "Unlock a hub" field instead of using a select.
Still open after the follow-up lanes (credit/bankruptcy, fleet sales, balance, campaign end, fare swing, UI polish are done; see their entries):
- The route creator needs aircraft already based at the origin hub and offers no way to move one there (hub-move flow).
- Greedy-bot margins are erratic; maintenance (A/B/C/D) is suspended; 25-year campaigns run past the 2025 data range; `validateSimState` does not check the campaign field.
- Seasonal load factor floats up to ~8 points under the fare controller (`seasonalFollow` is the dial).

## lane/start-year (optional start year, prior-generation aircraft)
- Start year: the new game form has a Start year field (default 2015). The sim takes `startYear` and `presentYear` in `startingScenario` (`startYearError` in sim/src/time/startYear.ts validates them; the sim never reads a clock). The campaign calendar is absolute (day 0 = 2015-01-01, negative before), so `jan1Day(year)` gives the start day and every year-keyed rule still works. 2015 is byte-identical to before.
- Floor: MIN_START_YEAR = 1965, but the effective earliest start is 1972: the data has no sourced aircraft in production before the DC-10-30 (introduced 1972). Confirmed and omitted types (707, DC-8, DC-9, 727, 737-100/200, 747-100/200/300, L-1011, 767-200, A300) are listed in packages/data/SOURCES.md with the missing fields. Adding them lowers the floor automatically.
- Next step for 1965: sourced unit prices (and the other missing fields) for the 707, DC-8, DC-9 and 727 are required before a 1965 start has a fleet; until then the effective earliest start stays 1972.
- Tests: no existing test asserted the old 2015-only order list, so none were changed. The 2015 order list now includes types recently out of production (767-300ER, endYear 2014). The Start year field is covered by one realBridge test, not by e2e.
- Availability: `canOrderNew` (sim/src/fleet/availability.ts) is the one order rule, used by the sim's orderAircraft, the app's order list and the picker. A type is orderable in production, or for RECENT_OUT_OF_PRODUCTION_YEARS (1) after its endYear, and introduced within the order lead. Used sales need a type built within 25 years (USED_SALE_MAX_YEARS_AFTER_END). Behaviour change in 2015: the 767-300ER (endYear 2014) can be ordered new in 2015.
- Production end field: the existing `endYear` (AircraftType in contracts) is the production-end field; no new field and no contract change. The econ-fleet lane's obsolescence and 30-year cap read the same `endYear`.
- Era starts: for start years other than 2015 the starting fleet and routes use the type in production that year closest in seats (same wide/narrow body); deriveHubRoutes takes that plan. Rival entrants launch relative to the start (RivalsState.originDay, absent = 0 in old saves).
- Known limits: fuel and carbon series clamp before 2015 (no pre-2015 price sourced); demand growth runs backward from 2015; rival field and fares are 2015 calibration; DC-10 cabin geometry is an ESTIMATE.

## lane/hub-fleet (hub rules, fleet multiselect; from Mark's backlog)
- Only the home hub is owned at the start. `unlockHub` (cost `COMMAND_PARAMS.hubUnlockUsd` = $50M) adds a hub, charges cash and writes a `world.cashLog` entry. Errors: `already_hub`, `insufficient_cash`, `unknown_airport`.
- `world.ownedHubs` is the hub list. Saves without it keep the old derived set (home, aircraft bases, terminal keys), see `ownedHubsOf` in sim fleet/hubs.ts.
- `setAircraftHub` and `orderAircraft` (new optional `deliveryHubId`, default home) refuse non-owned hubs with `not_a_hub`.
- Fleet: move selects list owned hubs only; row checkboxes with a bulk bar (move to hub, cabin change for one type). Orders: delivery hub select. Hubs view: unlock control.
- Not done: offers still deliver to the home hub (acceptOffer has no hub field); hub board airport dropdown still lists all airports; `setHubTerminal` is not limited to owned hubs.
- Gate (lane/hub-fleet): `pnpm install --frozen-lockfile`, typecheck, test (data 82, sim 338, app 190), build all pass with no lane fixes needed; e2e 48/48 (24 checks x 2 themes) against a dev server on port 5260.

## lane/open-tickets (route inspector load factor, cleanup)
- Route inspector: "Target load factor" row (value or "off") in Schedule and fares, and a field in Adjust (50-95, blank = off) that dispatches `updateRoute` with `targetLoadFactor` number or null; sim errors (`invalid_target_load_factor`) shown inline and as a toast. Parse/format/describe helpers in `routes/helpers.ts` (shared with the creator, tested in `helpers.test.ts`). RouteCreator no longer carries a local cast (fixed in 94e1cb5).
- Removed the "Auto-pause on events" setting: store field and localStorage key, `useSim` feed, bridge `setAutoPause` and `autoPause` option, Settings switch, and the e2e toggling around the speed checks.

## lane/sim-policy (fare policies, connection markdown, hub slots, terminal fees; sim side only)
- Implemented in packages/sim (details in MODEL.md "lane/sim-policy"): commands `setFarePolicy` / `removeFarePolicy` / `setHubTerminal` (typed errors `invalid_fare_policy`, `unknown_policy`, `unknown_terminal`), `routeCategories`, `effectiveTargetLoadFactor` (weekly solve now uses route target, else policy target), `connectionMarkdown` in route/network.ts (0 = byte-identical), `hubCongestion`, slot fees (company-level daily cost, ledger line "Slot and terminal fees" via `weeklySlotFees`), `insufficient_slots` on open/update route (non-notional fleet only).
- UI API: `dispatch({kind:"setFarePolicy", policy})`, `dispatch({kind:"removeFarePolicy", id})`, `dispatch({kind:"setHubTerminal", airportId, terminalId})` on the real bridge (already generic, nothing to add); read `hubCongestion(bridge.getSim(), airportId)`, `weeklySlotFees(sim)`, `routeCategories(route, sim.airports, playerHubs(sim))`, `effectiveTargetLoadFactor(route, sim.world.farePolicies, sim.airports, playerHubs(sim))`. The mock bridge ignores the new commands.
- Slot and fee constants are estimates (SLOT_PARAMS). Terminal data arrives from another lane in packages/data; without it every airport has the implicit terminal "MAIN".
- Tests: route/policy.test.ts (15). Soak `--games 3 --years 3`: 0 violations, cash identity exact (3279 days), replays identical. Slot fees lower all cash figures slightly versus earlier runs.

## lane/fleet-fix (owner feedback)
- Route inspector banner: `typeOwnership` / `ownershipReason` (routes/helpers.ts, tested) count owned, free and on-route aircraft from the fleet. "You own no X" only when none is owned; otherwise "your N X are all flying other routes" or the free count.
- Fleet view is the type table only: cards and sort bar removed (fleetSort.ts deleted). Each aircraft row in the expansion has "Move to hub" and "Cabin" (opens the cabin/refit dialog, same as before).
- Notifications: only aircraft deliveries raise a card (`sim/decisions.ts`). Rival fare-cut, low-load and heavy-check cards were removed by owner request (fareCut.ts deleted). No delivery or notice pauses the clock; the dock no longer auto-opens or auto-expands. The Settings "Auto-pause on events" switch was removed (lane/open-tickets): it had no trigger and no effect.
## lane/lf-sim (target load factor per route)
- `Route.targetLoadFactor?` (0.5..0.95). Weekly step (day % 7 === 0) re-prices routes with a target: `fareScaleForTargetLoadFactor` (bisection, 30 steps, 0.4x..2.5x of the current fares) through the same week evaluation as the live report; all fare classes scale together. Fares written back to `route.fares`; routes without a target are untouched.
- `updateRoute` patch takes `targetLoadFactor` number or null (clears); out of range returns `invalid_target_load_factor`.
- Tests: `route/fareSolver.test.ts` (7). Gate: typecheck green; sim 301 (293 excl. qa + 8 qa), app 149, data 23; build green.
- Note: load factor falls as economy fares rise, so a higher target lowers fares (the spec's "fare rises when target is raised" was not implemented).

## lane/fleet-app (fleet type table, route block hours)
- Fleet view: type table (in service, on order, free block h/wk, used/available h, Order button per type), hub filter, inline expansion to aircraft with a per-aircraft "Move to hub" select (dispatches setAircraftHub). Card list and sort bar kept below.
- Route sandbox: type picker lists only owned or on-order types; block hours needed vs free at the origin hub shown live; default frequency capped to what the origin hub can fly; insufficient_block_hours shown inline.
- Pure helpers: `packages/app/src/fleet/typeTable.ts` (tested), `typeBlockHours` in sim `fleet/hubs.ts` (tested).
- Gate: install, typecheck, test (data 23, sim 294, app 149), build, e2e 46/46. e2e route check now bases one B737-800 at SFO via the Fleet view first.

## Route creation layout (lane/route-ui)
- Route sandbox is 880 px wide and fits 1280x720 and 1440x900 without scrolling: Plan column (aircraft, flights/wk with +/-, block-hour readout, fares) and Market/Projection column; messages and buttons in a footer.
- New "Target load factor" field (percent 50-95, blank = off, hint "Fares adjust to hit this"). It is sent on openRoute as `targetLoadFactor` via a widened draft type; it has no effect until Route.targetLoadFactor merges in contracts (lane/lf-sim). Inspector and updateRoute patch not wired here.
- Gate: install, typecheck, test (data 23, sim 294, app 149), build, e2e 46/46.

# Build status (update at the end of every work session)

Last updated: Tue 10 Nov 2026 (lane/qa-playtest-fixes). Gate green on the lane: typecheck, test (data 82, sim 382, app 202), build, e2e 48/48. Credit/bankruptcy, fare-swing, UI polish, aircraft sales and campaign end are merged on this lane; balance calibration all merged on this lane. Not yet merged to main.

Last updated: Fri 6 Nov 2026: globe (1,006 airports, tiers, presets), terminals, slots, fare policy, Hubs and Fare policy panels merged on lane/integration-globe; gate green (data 82, sim 330, app ~176). e2e full suite not re-run.

Last updated: Thu 5 Nov 2026 (merged lane/save-safe, lane/hub-board). Gate green: typecheck, test (data 23, sim 301, app 156), build. e2e not re-run. B01, B05, B06, B10 verified already fixed on main.

Last updated: Tue 3 Nov 2026 (lane/world-int). Gate green: install --frozen-lockfile, typecheck, test (data 23, sim 279, app 143), build, e2e 46/46 (23 checks x 2 themes). Soak `--games 8 --det 1`: 8 games x 10 y, 0 violations, cash identity exact over 29144 days, determinism replay byte-identical, 373 s total (mean 42 s/game). See "World integration lane" below.

Last updated: Tue 3 Nov 2026 (lane/qa-ui). On lane/qa-ui typecheck, test (data 15, sim 197, app 97) and build pass, and the Playwright e2e passes (22 checks per theme). `main` itself was last verified before this lane.

Legend used below: **implemented** = code exists and works in play; **tested** = unit/e2e/soak coverage exists (stated per item); **known broken** = a reproduced defect, listed under "Known issues". "done" in the table means implemented.

Last updated: Mon 2 Nov 2026 (UTC morning). `main` passes typecheck, test (data 13, sim 197, app 82; on lane/nomaint) and build.
Last updated: Mon 2 Nov 2026 (UTC morning). `main` passes typecheck, test and build. lane/orwa: data 15, sim 191, app 82 tests.
lane/qa-save: data 15, sim 224, app 94; typecheck, test, build pass.

## lane/qa-forecast (SQA B02, B04, B11, suggestion 7)
- Route inspector previews, the seasonal chart and the type-swap comparison now run the live model (`previewRoutePatch`, `seasonalRouteProfit`, see MODEL.md "Route forecasts"); route sandbox headline uses `previewNewRoute` (own fleet, rivals, network) and falls back to the standalone projection, labelled "Planned, not yet operating", when no aircraft could fly it.
- Substituted aircraft: capacity and costs follow the aircraft that fly (weighted by round trips); inspector shows "Planned A321, flown by 2 x B737-800" with a banner; open-route warnings are toasted.
- Planner header: "N current, M upcoming" (current = short all along). Aircraft picker and route sandbox show nominal and usable range (`usableRangeKm`).
- Open: sandbox frequency sweep and best-type search are still the standalone model; network re-price omits cabin service multipliers; QA.md not refreshed.

## lane/world-app (app side of the US + Europe expansion)
- Fleet view sorts (type, status, tail, age; asc/desc) live in the UI store; comparators in views/fleetSort.ts (tested).
- Map: land.json now holds all US states plus Europe (focus) and world context from world-atlas 50m (about 1.0 MB raw, +316 KB gzip vs 35 KB / 9 KB before; script `pnpm --filter @arg/app exec node scripts/build-geo.mjs`). Western Aleutians (lon > 0) are dropped from land and Aleutian airports are drawn at lon - 360 (displayLon) so arcs stay continuous.
- Presets: West Coast, United States, Europe, Alaska, Hawaii, World (fit all airports); last camera remembered in localStorage `arg-camera`; palette entries "Map: show ...".
- LOD (map/lod.ts): markers chosen by rank, screen spacing and a zoom budget; labels are decluttered from that set; hit-testing only sees drawn markers. Hubs now scale (up to 24) and keep one per land mass.
- Pickers: AirportField searches code/city/name/state/country (accent-folded), filter chips (continent, country, state) appear when the data has more than one option. Names in routes/geoNames.ts fall back to raw codes. Rivals market table is capped, scrolls and filters.
- Dev stress: `node scripts/dev-stress-airports.mjs <OurAirports airports.csv>` writes gitignored src/dev/stress-airports.local.json (fabricated economics); open `?mock=1&stress=600`. `node scripts/screenshots.mjs --world` takes the world shots.
- Caveats: far band (zoom < 4.7) still shows hub corridors, so Europe and US presets show corridors until zoomed; Aleutian land is not drawn; sim/route creation do not know stress-only airports.

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
| T14 basic rivals | done: sim and UI wired; tested by sim tests and rivals helper unit tests | sim + Rivals view, competition block in route inspector, map competitor layer, rival fare-cut decision cards (match / partial + frequency / hold; one at a time) |
| T15 why ledger and hub board | done (lane/hub-board) | ledger in inspector; hub board view (Alt+0, palette) with departures/arrivals board and block-hour panel; no per-flight times in sim |
| T16 save/load, cabin sliders, light polish | done | Cabin sliders done: designer view, order and refit editors (lane/cabin, see MODEL.md "Cabin"); save/load done (lane/saveui): IndexedDB 5 slots + autosave (monthly, tab hide), Ctrl+S, export/import, start screen (skip with ?newgame/?seed/?nostart/?ff/?mock/?paused) |
| T17 QA and balance bots | done (first pass) | bots + BALANCE.md; soak (30 games), fuzz, Playwright e2e (22 checks x 2 themes since lane/qa-ui: modal focus, narrow widths, pill overlap added), QA.md with manual checklist. Tested: sim invariants, save round-trip (unit), rivals helpers (unit). Not covered by e2e: save/load, start screen and rivals flows. Independent SQA 2 Nov 2026: 6.5/10, findings in QA.md |
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
Known broken (reproduced by the independent SQA, 2 Nov 2026; details and locations in QA.md "Open issues"):
- B01 a damaged save can replace and break the running game (validate, then swap).
- B02 route-change profit deltas mix preview and live models; fare-cut estimates inherit this and are labelled "est.".
- B03 no player bankruptcy rule or credit limit: 8 of 12 SQA games and 23 of 30 bot games end with negative cash.
- B04 substituted aircraft use the requested type's economics. B05 three default cabins fail cabin rules. B06 regular-order discounts have no lasting effect. B10 an unchanged refit charges money. B11 planner header counts 0 issues while the Issues tab shows one.
Not built yet: first-session tutorial, goals and end-of-campaign review, hub board (T15), why-ledger beyond the inspector, deploy (needs Mark's Cloudflare secrets), Web Worker for the sim (about 0.9 ms/day on the main thread).
Other notes:
- Rival bankruptcies are rare (only Ember Air in the seed-2015 baseline); the 2020 pandemic is not modelled; rivals now react to player fares only through the fare-cut cards.
- Balance lane (packages/sim/BALANCE.md): aircraft order discount has no economic effect (B06); starting fleet is 8 aircraft (3x 737-800, A320, 2x 757, 2x 777).
- Bundle split into react/maplibre/deckgl/app chunks; the map is the home view so all chunks load up front.
- Decision cards expire after 45 days. An opened (peeked) notification dock still floats over page content until minimised with Esc or J. Finance cash chart y-axis labels may clip; toasts can overlap page headers on non-map views.
- Fixed in lane/qa-ui: B07, B08, B09 and the dock-overlap note (see below).

## QA/UI lane notes (lane/qa-ui)
- Supported minimum width 360 px (desktop is the target). Top bar: two rows below 560 px, date moves to the time pill between 561 and 900 px, sparkline hidden below 900 px, airline name truncates. Settings controls stack below 700 px; the map zoom control moves to the right edge at narrow widths.
- `--pill-clear` (5.25 rem, shell.css) is the bottom strip reserved under every view for the time pill and the collapsed notification pill; the full-width route panel (narrow) stops above it.
- `shell/Modal.tsx` + `shell/focusTrap.ts`: the only modal implementation (portal to body, inert background, Tab trap, Escape/backdrop close, focus return). Use it for any new dialog; do not hand-roll `aria-modal`.
- Notification dock: decision cards carry `routeId` (fare cut, low load, delivery) and link to the route in Routes; unresolved decisions sort above offers and routine notices (`sortDecisions`), "Decide later" ones after the active ones. Fare-cut options show estimated weekly profit change and load (`sim/fareCut.ts`).
- Screenshots: take your own with Playwright at 1280x720, 633x615, 390x844 in both themes; QA e2e also saves `qa-<theme>-narrow-*.png`.

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

## Fleet hubs lane (lane/fleet-sim, sim only)
- Block-hour pools per hub and type (`packages/sim/src/fleet/hubs.ts`): `hubBlockHours`, `routeHourSummary` (live figures for the UI), `blockHoursPerFrequency`, `stampAircraftHubs`.
- `Aircraft.hubId` and `WorldState.homeHub` are optional. Absent means the home hub (`baseAirport`, else LAX). Scheduler: an aircraft flies only routes that touch its hub (origin or destination); no cross-hub substitution.
- `openRoute` and `updateRoute` refuse with `insufficient_block_hours` (needed vs free shown) when the origin hub's pool is short. The check is skipped when `notionalFleet` is on (sandbox). Pools count active aircraft only, so a route on a type still on order is refused until delivery.
- `setAircraftHub` command. Saves: no SAVE_VERSION bump (fields optional; load stamps `hubId` on every aircraft).
- Test fixtures that opened routes with no hub-based aircraft now add one (`testing/basedAircraft.ts`). Routes with no hub-based aircraft are underSupplied, not substituted. App UI for hubs is not built.

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
- Screenshots: `node scripts/screenshots.mjs --uifix` (uifix-* files). Known: e2e speed-rate checks are timing-sensitive.

## Session note (post-playtest 1)
- Merged lane/uifix (aircraft picker tiles, route aircraft swap, notification dock, bottom-right time pill) and lane/planner.
- Runway rule: widebodies now use a stage-length requirement (`runwayRequiredM` in data, `simRunwayM` in sim) so A330/787 can serve OGG from the mainland; narrowbodies unchanged. 777s still cannot.
- Heavy-check decision cards link to the planner ("Plan cover in the planner").
- Open: hub board (T15), player bankruptcy rule, substituted-flight pricing uses requested type.

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

## World data lane notes (lane/world-data)
- Data only: packages/data now has 496 airports (233 US incl. AK/HI/DC, 263 Europe), `metros.ts` (26 multi-airport groups, shares are tuning weights), landmass-based `isLandPair`/`isOverwaterRoute`, and `canFlyOverwater` (ETOPS-radius alternate coverage, lets 180-minute narrowbodies and the 757 cross the North Atlantic via Newfoundland/Greenland/Iceland/Ireland). Conventions, formulas, evidence table and caveats are in packages/data/SOURCES.md ("World expansion"). All passenger counts, populations and GDP figures are recalled, not fetched (Wikipedia, FAA, Eurostat, World Bank were unreachable): spot-check.
- Data tests: 23 pass. Sim: 235 pass, 1 FAILS: `rivals.test.ts` "runs fast, keeps a plausible industry..." (a rival ends a 10-year run with cash 241M, above 3x its initial cash). Cause is in sim, not data: rivals expand over `ctx.airports` (engine.ts: hub filter `metroPopulation > 900_000 && slots >= 30`, route search over every airport), so the 496-airport world gives them far more profitable routes. Not fixed here (sim lane). App: 114 pass.
- Sim/app still treat the world as CA/HI/OR/WA in places (map camera presets, pickHubs, calendar/fuel by region "CA"|"HI"...): a later lane must scope or generalise them. Airports flagged X in SOURCES.md (TXL SXF RYG DSA) close during the campaign; the sim has no airport end dates yet.

## World sim lane notes (lane/world-sim)
- Sim is region-generic (docs: MODEL.md section 12, RIVALS.md "World field", BALANCE.md "Whole US and Europe world"). Gate runs green with all sim tests. SAVE_VERSION 2 (reads 1 and 2; `migrateV1` fills country/landmass and appends the airports a v1 save lacks).
- Open for other lanes: (done in lane/world-int: BER added, app uses `benchmarkFareFor`, overwater/closed errors shown, camera and hubs checked.)
- Regional constants are estimates, flagged in MODEL.md section 12. Alaska has no surface alternative. Kestrel Air shrinks to a few routes.

## World integration lane (lane/world-int)
Playtested the expanded world through the UI (Playwright, `packages/app/scripts/playtest.mjs`: fresh 2015 game, orders 2 B787-9, opens LAX-JFK, JFK-LHR, LHR-CDG, FRA-MAD, ANC-FAI, SEA-ANC, HNL-OGG, runs 90 days, dumps Routes/Fleet/Planner/Rivals/Finance/Orders text and screenshots, fails on console errors). All seven routes open, show regional fares (FRA-MAD $135 market, LHR-CDG $86), load factors and profits, previews work, the map draws them, the rivals view lists the 13 carriers incl. the European ones, no console errors or warnings.
- Defects found and fixed: (1) route sandbox, route inspector, cabin projection and rival presence used the US-only `benchmarkFare(km)`; now `benchmarkFareFor(a, b)` (`marketFares(km, a, b)`). (2) Sandbox default aircraft ignored the owned fleet (LAX-JFK came up as a B777-300ER the airline did not own, LHR-CDG as an E175, HNL-OGG as a 777 that then starved the existing 777 routes); it now defaults to the most profitable type the airline has in service. (3) Sandbox default frequency came from the standalone model and fell to 1 a week whenever nothing paid; it is now sized with `previewNewRoute` on the live network (own profit plus effect on other routes, full schedule preferred), standalone only as fallback. (4) The app's draft validation reported a generic `cannot_fly`; it now uses the sim's `routeFeasibilityError` (new export in commands.ts, shared with the open-route command), so closed airports, range, runway and overwater limits give the specific messages (`airport_closed`, `out_of_range`, `runway_too_short`, `overwater_limit`) in the sandbox and the toast of the real command. (5) Far-zoom map drew hub corridors for any network, so LHR-ZRH looked like LHR-FRA and LHR-MAD like LHR-IBZ; networks of 30 routes or fewer now draw their real routes at every zoom (`AGG_ROUTE_THRESHOLD`). (6) The map camera did not follow the home airport: starting at another hub flies to the matching preset (`presetForAirport`).
- Starting airline selectable: start screen has an airline name field (default Skybridge Pacific) and a home airport list (60 largest, US and Europe groups, LAX default); see MODEL.md 12a. `startingScenario(..., { hub, name })`, `hubCandidates`, `deriveHubRoutes`. LAX default is byte-identical (tested by comparing the whole state).
- BER added to packages/data (OurAirports EDDB, runway 4000 m, EU-MAINLAND, flag C, pax 25000 placeholder), metro BER group TXL/SXF/BER, SOURCES.md updated and evidence table regenerated. Two existing world tests that assumed "no BER" were moved to a window (26-30 Oct 2020) where it is still true; new tests: Berlin served after Nov 2020 and FRA-BER refused before opening.
- Flaky e2e '[light] speed 4': root cause is not sim cost. Measured: the clock runs at the right rate (speed 4: 25 days in 3.6 s; speed 5: 28 days/s) and a day costs about 7 ms, so the main thread keeps up. With 13 rivals in a 496-airport world a rival decision card appears within a few days and auto-pause stops the game, so the measurement read "4 days in 3.5 s". The rate checks now switch auto-pause off in Settings (restored afterwards), dismiss open cards and report whether the game was paused in the failure message; the speed-5 check still runs with auto-pause on. No change to the clock loop was needed.
- E2E now has 23 checks per theme (start-screen hub check added).
- Caveats: derived hub routes are single-origin from the hub (no inter-hub network); LGA, DCA, STN, MDW and OAK get three routes; AGP has one marginal route; hub choice is cosmetic apart from the routes and fleet (no hub-specific costs or slots in the sim); `playtest.mjs` opens 7 routes with 8 aircraft, so later routes starve the earlier ones (scheduler priority), which is the player's over-extension, not a bug. Frequency defaults in unprofitable markets (LHR-CDG, ANC-FAI) are still 1 a week because every option loses money in the model (rail/rivals).

## lane/globe-data (whole-globe airport set; branched from lane/integration-policy)
- packages/data now has 1,006 airports (498 US/Europe + 508 new): Canada 25, Mexico 28, Central America + Caribbean 39 (92 N. America incl. Canada/Mexico with PR/VI), South America 73, Africa 55, Middle East + Turkey + Caucasus + Central Asia 45, South/East/Southeast Asia 191, Oceania + Pacific 53. Hawaii and Alaska unchanged. Lists: `scripts/world_airports_{amer,afme,asoc}.tsv`; generator extended (country GDP/tourism tables, `COUNTRY_LAND`, island map). Existing 498 rows regenerate byte-identically.
- Sourced from OurAirports (fetched 2026-11-06): id, lat, lon, runwayM, name, country. ESTIMATED/RECALLED and flagged in SOURCES.md "Globe expansion": pax (selection only), metroPopulation, gdpPerCapita, tourismIndex, slotsPerHour. Nothing in contracts or terminals.ts touched.
- geo.ts: `isOverwaterRoute` treats land-joined blocks as one (`LAND_CONNECTED`: North America; Europe-Asia-Africa); `isLandPair` unchanged. 14 metro groups added (Tokyo, Osaka, Seoul, Shanghai, Istanbul, Sao Paulo, ...).
- Tests: data 82 (new "globe expansion" block: unique ids and coordinates, country/region/landmass/runway on every row, continent counts, island overwater rules, long-haul feasibility), sim 316, app 156; typecheck and build green. Three older tests changed because the Canadian airports now serve as ETOPS alternates: ANC-BIS E175 is no longer an overwater example (app tests use SYD-AKL), the sim fuzz accepts `overwater_limit`/`airport_closed`, data ETOPS test now expects E175 JNU-MSP to be allowed.
- Perf: 1,006 airports cost 4.5 ms per sim day in `qa/perf.test.ts` (printed as PERF; limit 40); soak `--games 4 --det 1`: 0 violations, cash identity exact, replay byte-identical, 17 s per 10-year game.
- Caveats for other lanes: sim `isEurope = country !== "US"` (world/regions.ts) so every new airport gets European fees, fuel, labour tier and fare level; `RAIL_QUALITY_BY_COUNTRY`, `ETS_COUNTRIES`, rivals scopes, `REG_PREFIX` and hub list have no entries for the new countries (defaults used); `surfaceAlternative` sees no road/rail across borders (isLandPair unchanged); app `geoNames.ts` `continentOf` returns "Other" and raw ISO codes for countries it does not list (picker chips), map `land.json` is world-atlas 50m so coastlines exist but LOD/presets are untuned for Asia/Africa/South America (no preset); no closure/opening calendar for new airports (e.g. new Istanbul, Daxing); recalled pax/GDP tables are low-confidence for small countries.

## lane/save-safe (B01 follow-up)
- B01 validation (validateSimState, validateExtras, loadGame validate-trial-swap with rollback) already existed from lane/qa-save; this lane adds app-level tests only (saves.test.ts): corrupt JSON, empty, truncated, wrong version (future and string), wrong format tag, missing state/world, null and NaN/Infinity cash, negative day. Each rejects with a message and leaves the running game byte-identical and steppable. No source, contracts or sim changes.
## lane/hub-board (T15 hub board, read-only)
- Hub board view (toolbar, palette "Go to Hub board", Alt+0 as the tenth view; `viewKey`/`viewIndexForKey` in shell/views.ts). Hub select (home first). Left: departures/arrivals board (route, type, freq/wk with scheduled vs requested, load factor, connecting share, weekly profit). Right: block hours used/available/free per type with bars. Header: routes, weekly profit, connecting pax/wk and share.
- Built from `reports`, `routes`, `fleet` and sim `typeBlockHours`; no sim or contracts changes. Pure helpers `packages/app/src/hubboard/hubBoard.ts` (tested). Routes without a report show "n/a".
- Unavailable / caveats: no per-flight times or delays (sim has no timetable); `hubBlockHours` counts routes by origin only, so arrivals use the origin hub's pool; connecting share is passengers carried on that route (`RouteReport.connecting`), not a per-market split. Playwright e2e not run.

## lane/hubs-ui (Hubs and Fare policy panels, app only)
- Toolbar order is now Fleet, Hubs, Fare policy, Planner...; palette "Go to Hubs" / "Go to Fare policy". Shortcuts: digits are used up (Alt+1..9, 0 = Hub board), so Hubs = Alt+- and Fare policy = Alt+= (`VIEWS` entries now carry an explicit `key`/`code`; `viewForKey`, `viewShortcut` in shell/views.ts, tested; old digit shortcuts unchanged). Toolbar is tighter below 800 px height so all 12 buttons fit at 1280x720.
- Hubs (views/HubsView.tsx, hubs/hubs.ts): home hub as a header note, then a card per other hub from `playerHubs(sim)`: slots you / all airlines / available with a bar (`hubCongestion`), terminal table (fee tier, source or "Estimate" for sources starting "estimate:", your slots, capacity, weekly fee or fee if moved), premium tag, a select to move (`setHubTerminal`) with the weekly fee difference and a Modal confirm. Airports without terminals show the single implicit terminal and no select. Empty and ?mock states are handled (mock has no `getSim`, panel explains and disables editing).
- Fare policy (views/FarePolicyView.tsx, farepolicy/policy.ts): list/create/edit/delete (`setFarePolicy`/`removeFarePolicy`, Modal confirm for delete), name, target 50-95% slider+field or Off, connection markdown 0-50% with explanatory hint, scope All / categories / hand-picked routes (checklist with search), live preview of every route's covering policies and effective target (route target > last matching policy), reorder with up/down (the sim has no reorder command: the changed tail is removed and re-added in order, `reorderPlan`).
- Integration fix: packages/data keeps terminals in their own table and nothing attached them to the sim's airports, so every airport had only "MAIN". realBridge.ts now builds `dataAirports` with `terminalsFor(id)` attached; this changes slot fees at big hubs (default terminal = first non-premium).
- e2e: new check "Hubs and Fare policy" in e2e/run.mjs (base an aircraft at SFO, palette, move terminal, Alt+=, create/reorder/delete policies, 1280x720 screenshots); `--only <text>` runs a single check. Passed in dark and light; other e2e checks not re-run. Screenshots in packages/app/screenshots/qa (git-ignored).
- Not done: no UI to add a hub at an airport without aircraft based there (a hub appears once an aircraft is based there or a terminal is chosen).
## lane/globe-app (fixes the lane/globe-data caveats; branched from lane/globe-data)
- Sim: `isEurope = country !== "US"` is gone. `regionGroupOf(country)` (world/regions.ts) puts all 178 data countries in us / northAmerica / europe / latinAmerica / middleEast / africa / southAsia / eastAsia / southeastAsia / oceania; each non-US/Europe group has fuel, airport-fee, handling, crew and fare-level tiers (`TIERS`, plus a few country fuel overrides). All values are labelled estimates with rationale in MODEL.md 12b. US and Europe use the old constants unchanged (tested to equality); `benchmarkFareFor` and so the app's default fares follow the tiers. Rivals and random start-ups stay US/Europe (`inScope` "EUROPE" = the Europe group), which restores the pre-globe rival behaviour that the 1,006-airport world had changed.
- App: `continentOf` / `countryName` cover every country (North America, South America, Europe, Africa, Asia, Oceania; Turkey, Caucasus and Central Asia count as Asia; Russia as Europe), so picker chips and `placeLabel` have no "Other" or raw codes. Camera presets added: Canada / Mexico (also Caribbean and Central America), South America, Africa, Middle East, Asia, Oceania; `presetForAirport` picks them for a home hub. `pickHubs` keeps the 4 biggest airports of every continent (cap 24 -> 32 hubs for the 1,006 set; identical result for sets of 60 or fewer), so far-zoom corridors always have a cluster centre per continent; a US/Europe network still draws only US/Europe corridors (tested). LOD tested on all 1,006 airports in every preset (budget, time, largest airport always drawn). The preset row wraps.
- Start screen: home airport list is `hubCandidates(airports, 150)` grouped by continent (SIN, GRU, DXB, SYD, JNB, HND, DEL, MEX, YYZ... included; `save/startHubs.ts`). `hubCandidates` now drops runways under 2,000 m (Congonhas), and `deriveHubRoutes` accepts the least-losing feasible routes as a last resort so JNB, GIG, BSB and DMK start with three routes (all 150 candidates checked: at least three, each passes the open-route command). Registration prefixes added for 30 more countries.
- Soak (`pnpm --filter @arg/sim soak --hub SIN ...`, new `--hub` flag): SIN 4 games x 5 years, 0 violations, cash identity exact, replay identical; GRU, DXB, SYD 4 games x 10 years each: 0 violations, cash identity exact, replays byte-identical.
- Rival data MISSING for non-US/non-European regions: no sourced airline list, fleets or route networks for Asia, Middle East, Africa, Latin America or Oceania, so none was invented. A hub there plays against the existing 13 US/European carriers only (they do not enter that region) and no local rivals; the rivals view is correspondingly empty there. A later lane needs sourced carriers (RIVALS.md "World field") per region.
- Caveats left: demand still uses the Europe income reference (`europeIncomeRefUsd`) for every non-US pair, ground/rail alternatives and `groundKm` are US/Europe-only (no road or rail across new borders), no seasonality tags outside US/Europe, no closure/opening calendar for new airports, Europe camera preset is unchanged (Canaries and northern Scandinavia fall outside it), Pacific islands east of the date line (Samoa, Tonga, Cook Islands) fall outside the Oceania preset. Playwright e2e and screenshots not run.

## Backlog from Mark (Nov 6, not started)
- Bug: map is gray outside US and Europe (leftover from when the world was only partly available).
- Hubs: only the starting airport is free; unlocking a hub costs money (about $50M proposed). Aircraft can only be assigned to hub airports. At order time, pick the delivery hub (new aircraft currently all land at LAX). Multiselect for aircraft being redesigned.
- Retire the planning panel (disable; code may stay).
- Start year optional, 1965 to present. Endless play after the present day with current aircraft; add prior types (707, DC-9, and others) for earlier starts.
- Remove the routes panel on the right of the map screen (the openable routes panel stays).
- Map: globe/flat toggle (low priority).
- Airport maps for hubs (simple, matching style). Terminal selection for the starting hub is broken.
- Route and cabin load factor reporting: overall LF, LF by cabin (empty business should be visible), percent of passengers connecting.
- Remove the auto-zoom region selector at the top of the map.
- Orders and aircraft-order pages: make the All > Airbus > A350 breadcrumb card-based, not hyperlink-style.
- Seat maps: two-deck aircraft (747, A380) show both decks in the cabin designer.
- Hub board: the airport dropdown shows all airports; should show only owned hubs. %connecting reads 0 everywhere. Check whether this is faulty logic or faulty reporting (10% connecting-fare markdown in effect).
- Economy: order options for lease (down payment, higher operating cost at delivery) or purchase (20% down, 80% at delivery).
- Aircraft lifecycle: hard cap at 30 years. Price rises considerably 15 years after out of production (parts shortage). Passenger-experience penalty.
- Passenger experience: cabin config and service quality drive fares (e.g., 1-2-1 business with superior service commands a higher fare than 2-2-2 with weaker service).

## lane/map-views (Backlog from Mark: map, hubs, cabin)
- Hubs: the home hub now has a card on the Hubs panel (listed first, marked "home") with its own terminal choice. The bug was in the panel, not the sim: `HubsView` dropped the home hub, so the starting hub's terminals could not be selected. `hubCardIds` in `hubs/hubs.ts` orders the cards.
- Airport schematic on each hub card (`hubs/AirportSchematic.tsx`): longest runway from `runwayM` (bar to a fixed 4,500 m display scale) and the terminals as a list, current terminal highlighted, staged move target dashed. Terminals are not placed on a map because the data has no terminal geometry. Light and dark via CSS variables.
- Skipped, globe/flat toggle: MapLibre GL 4.7.1 (the version the app pins) has no globe projection; the globe branch is not in this version. Toggle not added.
- Skipped, two-deck seat maps: the sim treats the 747 as one equivalent cabin length with the upper deck counted as extra length (`sim/src/cabin/geometry.ts`), and `packages/data` has no deck field. There is also no A380 in the data. A real two-deck view needs a deck field in data and per-deck sections in the layout (sim and contracts changes), so it is left for a sim lane.
- e2e: the Hubs test asserted the home hub was absent from the table; it now asserts the home card and terminal selector exist, and scopes the SFO move checks to the SFO card.

## lane/ui-cleanup (backlog items from Mark, app only)
- Map land: `land.json` context countries were drawn in the muted gray `--map-land` and the cutoff `MIN_AREA.ctx` dropped small land (Singapore, Maldives, Barbados, Bermuda, Tonga, ...). Now all land uses the playable land style (`style.ts`, one fill, one coast glow, one border); `--map-land` removed from theme.css. `build-geo.mjs` ctx cutoff lowered to 1e-4 deg^2 and land.json rebuilt (280 features, was 251). Source unchanged (us-atlas, world-atlas 50m).
- Map screen: the right-side "Network" routes list is removed (shown only for a selected airport). Routes panel (openable) untouched. Camera preset bar removed from the map (presets still in the command palette). Map padding unchanged.
- Planner retired: `PLANNER_ENABLED = false` in shell/views.ts hides the toolbar entry, Alt+4, palette entry and page; PlannerView code kept.
- Hub board dropdown: options are `playerHubs(sim)` (home, aircraft hubs, terminal hubs; the same list as the Hubs view), no longer airports touched by two routes. `boardHubOptions` takes the hub list.
- %connecting: sim logic checked, not faulty. Default start (LAX, 2015, 10% connecting markdown) gives 1 to 7% connecting per route after 30 days to 2 years; the board's formula (2 x one-way / passengers) and summary match. Display rounded to whole percent, so 0.4% showed as 0%; connecting shares now show one decimal. An all-zero board was NOT reproduced; if it recurs, check a hub with a single route (no connecting market) and the report's `connecting` field.
- Aircraft picker: breadcrumb "All > Airbus > A350" is pill-style buttons (bordered, no underline); tile cards and Back behaviour unchanged.
- e2e: "Planner" removed from the view lists in run.mjs (it is no longer in the toolbar).

## lane/pax-cabin (passenger experience, cabin load, connecting share; from Mark's backlog)
- Service level per cabin (basic, standard, superior) is airline-wide: `WorldState.serviceLevels`, set with the sim command `setServiceLevel` and the selector at the top of the cabin designer. Default standard.
- Passenger experience (`sim/src/cabin/experience.ts`): comfort x service index x (1 - age penalty), against the type's default cabin (standard, new = neutral: multiplier 1, score 60). Premium fare multiplier bounded 0.85 to 1.25; economy stays 1 (the choice model prices off the economy fare). `ageServicePenalty` is a local equivalent (no other lane had added one): 0 up to 5 years, 1% a year beyond, capped at 15%. Service index 0.92 / 1.00 / 1.10 and these age figures are balance assumptions, not sourced data.
- The multiplier moves the premium fare; the fill penalty for pricing above the going multiple now measures against the experience-supported multiple, so a superior cabin is not penalised for its own premium.
- Reports: `RouteEvaluation.cabinLoads` (seats and passengers per cabin, merged across fleet groups), `loadByCabin` (empty cabins show 0%, cabins not flown show no load), `connectingShare` (2 x one-way through pax / all pax), `RouteReport.experience`. Inspector "Passengers" section and a "By cabin" column on the hub board read these.
- Connecting share: the sim figure was not zero in the starting network (2 to 8% of route passengers in a 30-day probe). The hub board now uses the same sim function as the inspector. Through passengers are spread over cabins by empty seats (their own cabin mix is not modelled).
- Not done: planner and rival projections outside the route model still use standard service where no airline context is passed; the market snapshot's connectingShare (rival one-stops) is unchanged; experience is not yet in the route list or the fleet view.

## lane/econ-fleet (aircraft economics, sim + order UI)
- Financing: `orderAircraft` takes `financing: "purchase" | "lease"` (default purchase), stored on the order and aircraft. Purchase: 20% of net price at order, 80% at delivery, no lease-equivalent charge afterwards. Lease: 10% of list price down at order, lease-equivalent from delivery plus a 15% uplift on `overheadPerAircraftPerDay`. Starting fleet and offer/legacy orders keep the old deposit-credit and lease-equivalent behaviour. Orders page shows both as cards.
- Lifespan: aircraft retire at 30 simulated years (removed from fleet and their order lists, with a notice). Fleet view shows the retirement year.
- Obsolescence: 15 years after `endYear` the maintenance cost (route ledger and check costs) and the lease basis of that type rise 40%. Ordering is blocked after production end, so the price rise cannot reach new orders; it applies to existing leased aircraft. Types with `endYear` null are unaffected.
- Passenger penalty: `ageServicePenalty(aircraft, day, asOfDay)` exported from `fleet/lifecycle.ts`; not wired into fares.
- Not modelled: depreciation or resale of purchased aircraft, offer orders keep the old 15% deposit, cash may go negative on a delivery balance.
