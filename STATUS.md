# Build status (update at the end of every work session)

Last updated: Sun 1 Nov 2026 (night). `main` passes typecheck, test (data 12, sim 107, app 35) and build.

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
| T8 connections/hubs | partial | evaluateHubConnection exists as a hook; not yet in daily stepDay |
| T9 finance and time | done | ledger, clock, speeds 0-5 |
| T10 UI shell | done | top bar, toolbar, feed, decision cards, command palette |
| T11 route inspector/creation | done | sandbox, inspector, why-ledger lines |
| T12 fleet/order book/checks | mostly done | orders with delivery delays, A-D checks, scheduler, Fleet/Orders views. Cabin layout selector disabled |
| T13 offers panel | not started | launch-customer, end-of-life, distressed-lot offers |
| T14 basic rivals | not started | only synthetic rival carriers inside the market model |
| T15 why ledger and hub board | partial | ledger in inspector; hub board not started |
| T16 save/load, cabin sliders, light polish | not started | |
| T17 QA and balance bots | not started | |
| T18 deploy and hardening | not started | |

## Known issues to fix next
- LAX-SAN starting route (14/wk A320) runs about 17% load factor; reduce frequency or fix short-haul damping.
- Route margins 42-51% before lease/overhead look rich; company margin is about 8%. Check balance.
- Multi-airport metros are about 2x real volumes (each airport treated as whole metro).
- Hub connecting passengers are not counted in stepDay finances yet.
- Spare aircraft idle all year in the starting fleet.
- Sim runs on the main thread (about 0.9 ms/day); move to a Web Worker later.
- Bundle about 2 MB (maplibre + deck.gl); split chunks.
- Toasts overlap page headers on non-map views; Finance cash chart y-axis labels may clip.
- Decision cards expire after 45 days.

## Usage rules from the owner
Mon afternoon/evening: keep about 30% free. Tue: unrestricted. Wed: none. Thu: after 3pm Pacific only. Fri-Sun: up to 80%. Finish early with cheaper models; quality can be revised later.
