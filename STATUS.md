# Build status (update at the end of every work session)

Last updated: Mon 2 Nov 2026 (UTC morning). `main` passes typecheck, test (data 12, sim 172, app 55) and build.

## Task table (T1-T18 from the Week-One Build Plan doc)
| Task | State | Notes |
| --- | --- | --- |
| T1 scaffold | done | pnpm workspaces, CI |
| T2 contracts | done | packages/contracts |
| T3 airports | done | 42 CA/HI airports, see packages/data/SOURCES.md |
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

## Known issues to fix next
- Player bankruptcy rule missing (QA.md bug 1): 23 of 30 bot games end with negative cash and nothing happens.
- Hub board (T15) not built. First-party SQA by the owner is next: follow the checklist in QA.md.
- Rivals UI not wired (market view of competitors, rival news cards); bankruptcies rare in normal play, so few distressed lots (see RIVALS.md).
- Save/load (IndexedDB), hub board, QA Playwright smoke tests, deploy not started. Sim still on main thread.
- Rival bankruptcies: only Ember Air fails in the seed-2015 baseline; consider shocks (2020 pandemic is not modelled).
- Balance lane (see packages/sim/BALANCE.md): rivals do not react to player fares; aircraft order discount has no economic effect; no bankruptcy rule in the sim; no pandemic shock.
- Balance lane changed the starting fleet to 8 aircraft (3x 737-800, A320, 2x 757, 2x 777) and edited two app tests (realBridge.test.ts) that depended on the old LAX-SAN bug and the 13-aircraft fleet.
- Sim runs on the main thread (about 0.9 ms/day); move to a Web Worker later.
- Bundle split into react/maplibre/deckgl/app chunks (T18); initial load still fetches all since the map is the home view.
- Toasts overlap page headers on non-map views; Finance cash chart y-axis labels may clip.
- Decision cards expire after 45 days.

## Offers lane notes
- Offer orders scale ownership cost by net price / list (`ownershipFactor`); ordinary orders still only change the deposit, so their volume discount is cash-neutral. Consider generalising.
- Used/distressed aircraft arrive with age and hours but their check clocks start fresh.
- Offer popup has no screenshot yet (screenshots.mjs captures the Offers tab only).

## Usage rules from the owner
Mon afternoon/evening: keep about 30% free. Tue: unrestricted. Wed: none. Thu: after 3pm Pacific only. Fri-Sun: up to 80%. Finish early with cheaper models; quality can be revised later.

## Cabin lane notes
- Default layouts for A220-100/300 (6-abreast) and A350-1000 (10-abreast) fail the new validation; defaultLayout was left untouched to keep today's numbers.
- Cabin geometry values are estimates (header of packages/sim/src/cabin/geometry.ts).
- Merge points: index.ts (export cabin, stepDay refit message), routeModel simulateRouteWeek (quality, fill ratios, cabinCost), ledger CabinInput.fillWeight and RouteInputs.cabinCost, commands.ts AnyCommand.

## Save/UI lane notes
- Save envelope in packages/sim/src/serialize.ts (SAVE_VERSION 1); bridge extras (feed, ledger, pending cards, decision engine) saved beside SimState. Loading starts paused.
- Screenshots: `node scripts/screenshots.mjs --saveui` (saveui-* files).
- Known: toasts overlap page headers; Delete-slot not offered; no Web Worker yet; extras are not validated beyond presence of engine.
