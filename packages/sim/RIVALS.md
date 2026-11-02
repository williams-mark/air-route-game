# Rival airlines (lane/rivals)

Code: `src/rivals/{config,types,engine,reports,index}.ts`. All constants are in `config.ts` (`ARCHETYPES`, `STARTING_RIVALS`,
`SCHEDULED_ENTRANTS`, `RIVAL_PARAMS`). Tests: `src/rivals/rivals.test.ts`. Names are fictional; none of the figures are real-world data
(fleets and frequencies are derived from model demand and `@arg/data` aircraft).

## Integration
- `SimState.rivals: RivalsState | null` (null = old synthetic rivals only) and `SimState.bankruptcies: BankruptcyRecord[]`.
  `startingScenario` creates the 2015 field; `newSim` leaves it null so existing tests are unchanged.
- `stepDay`: each player route is simulated with `rivalItineraries` (new optional `RouteWeekOptions` field). If any rival flies the pair its
  real itineraries (seats, fare, quality) replace the synthetic direct rivals; the synthetic one-stop stays. Pairs nobody flies keep the full
  synthetic market. At the end of `stepDay`, on days divisible by 7, `stepRivals` runs one weekly tick (pure, clones the rival state).
- Rivals use the same demand model (`marketOnDay`), logit choice (`ROUTE_CHOICE_PARAMS`) and ledger (`evaluateRoute`) as the player, with finite cash.

## Archetypes (config.ts `ARCHETYPES`)
legacy (Pacific Crown, hubs SFO/LAX, two cabins, fare x1.04, quality .62, matches an undercutter at x1.08, responds with fare and frequency, max cut 22%),
lcc (Kestrel Air SAN/OAK, Sierra Jet SMF/SJC, Ember Air entrant; single class 97% density, fare x0.86, quality .42, matches at x.99, max cut 30%, no frequency response),
regional (Golden State Express, ATR/CRJ/E-jets, thin short routes, fare x1.12), interisland (Islander, HI-HI only, 14+/wk).
Each has min/max frequency, entry share, estimate noise, indirect cost share of revenue (12-19%: HQ, sales, labour above crew, which the route ledger
omits; this is what brings company margins to roughly 5-15%) and fixed corporate overhead.

## Cadence (weeks; each airline has its own phase so they do not act together)
- Weekly: evaluate every rival route, P&L (route profit - indirect cost - fleet lease/overhead - corporate overhead), pricing: yield management of the
  base fare (up above 86% load, down below 68%, ceiling 1.12 x archetype fare) and retaliation.
- Monthly (4 wk): frequency changes from noisy load factor and margin (+10-25% when full and profitable, -12% when weak, never below the archetype
  minimum), frequency response during price wars (legacy/regional/interisland), dividends (half of cash above 1.6x starting cash), distress shrink.
- Quarterly (13 wk): exits (estimated margin < -5% two reviews in a row, route older than 26 weeks), then up to 2 entries chosen from 14 candidate
  markets near the bases with a noisy profit estimate; 2 years before re-entering a market it left.
- Annual (52 wk): retire aircraft past the age limit, move routes off types no longer obtainable, lease replacements if cash allows, hand back surplus.
- Fleet is leased: need = sum of route aircraft-equivalents x 1.06, per type; a 2-month deposit; early return costs 3 more months of lease.

## Noisy estimation
Entry estimate = true profit after ownership and indirect cost + revenue x (airline optimism ~ N(0, .07) + startup bonus .1 + N(0, archetype noise)).
Exit review and monthly decisions also add noise, so rivals sometimes enter bad markets and exit good ones.

## Memory and retaliation
Per airline per market `memory`. An episode starts when a competitor with at least 10% of the rival's seats (another rival or the player) has a fare more
than 6% below the rival's base fare, when someone newly enters the market (including the player opening the route), then lasts `memoryDays`
(lcc 75, regional 60, interisland 90, legacy 120), extended by a week at a time while still undercut up to twice that, then cools down 45-60 days.
Active: fare moves half way per week toward min(base, aggressor fare x matchFactor), bounded by the max cut and a floor. After: fare rises 4% a week
back to base. Fare cuts of 7% or more (per route, 56-day cooldown) become news.

## Staying power
Weekly loss streak and negative-cash streak. Distressed (cash under 6 weeks of fixed cost after 8 loss weeks, or 26 straight loss weeks): monthly the
worst loss-making route closes and surplus aircraft go back. Bankrupt after 26 consecutive weeks of negative cash or cash below minus the starting cash.
`BankruptcyRecord { lotId, airlineId, airlineName, archetype, day, aircraft: Aircraft[], routes }` is appended to `state.bankruptcies`; aircraft are real
contract `Aircraft` (default layout, ages, status active) for the offers lane. The airline stays in `rivals.airlines` with status "bankrupt", no routes/fleet.

## Entrants
Ember Air (LCC at LAX/SNA, USD 70M; it was ONT/LGB, whose metro-split demand is too thin for any candidate route) launches about mid-2017 +/- 90 days (seeded). From 2018 a 10% chance a year of a random LCC startup (name pool) while fewer than 8 are active.

## Fog of war and notices
`rivalReports(state, {playerOnly?})` returns per pair: carriers with frequency, seats, type, fare band (true fare +/- 7-13% with a stable per-rival error,
rounded to 5 USD). No finances. `rivalNews(state)` gives structured items (kind launch/enter/exit/fareCut/frequency/shrink/bankrupt, rival, pair, pct, frequency,
`playerMarket`). Notices on the event queue: any item in a market the player flies, plus launches and bankruptcies, e.g. "Pacific Crown cut LAX-HNL fares 12%."
Note `SimState.rivals` itself contains the true state; the UI should read through the report functions.

## Known limits
Rival schedule is evaluated once a week on one day's demand. Hub connections (`evaluateHubConnection`) still use the synthetic rivals. Rivals do not fly
connecting traffic. With the model's metro-sized airports rivals favour duplicate-metro pairs. No baseline seed produced an organic bankruptcy in 10 years
(rivals shed losers fast); bankruptcy is driven by price wars, shocks and the tests force it.

## Reconciliation with the balance lane (lane/reconcile)
- **Sizing on carried demand.** `engine.sizingDemand` = `baseWeeklyDemand x min(1, carriedShare / 0.8)`, where `route/rivalSizing.carriedShare` runs the choice model with one benchmark-fare itinerary against the outside option (driving included).
  Used for starting routes and entries. Ordinary air markets carry about 0.8, so they are unchanged; drivable pairs shrink (LAX-SAN carries about 0.25, so its rivals are about 3x smaller than the potential would give).
- **Starting field.** With the metro split, a pair's potential is per airport pair, so the old single-rival shares left the player alone on the trunk routes (100% load factor, no seats left for hub passengers). Added carriers on the player's pairs:
  Pacific Crown LAX-SFO 0.30, LAX-HNL 0.30, LAX-OGG 0.30 (were 0.17 / 0.22 / 0.22), Kestrel Air LAX-SFO 0.20, LAX-HNL 0.28, LAX-SAN 0.60, Sierra Jet LAX-OGG 0.20. Day 30: LAX-SFO 47 + 35 weekly round trips of rivals,
  LAX-HNL 14 + 27, LAX-OGG 10 + 7, LAX-SAN 20.
- **Indirect cost.** The recalibrated route ledger now carries 6% overhead plus USD 5k per route a week and higher crew/airport costs, so `indirectCostPct` fell (legacy and regional 0.19 to 0.155, lcc 0.135 to 0.105, interisland 0.17 to 0.13). Rival margins stay at 5-15% and no airline sheds all its routes (Kestrel did in 2022 before).
- **Empty airlines.** An airline with fewer than two routes takes any positive-estimate entry at its quarterly review (`relaxed`), and LCC candidate markets need only 400 potential passengers a week (was 1,000).
- **Result (seed 2015, ten years):** 5 active rivals plus 1 bankruptcy (Ember Air in 2021, after launching into LAX-SFO), 110 aircraft, 46 routes, rival cash USD 993M in total; no active airline with an empty fleet; 9 s per ten-year game with the full rival model.
