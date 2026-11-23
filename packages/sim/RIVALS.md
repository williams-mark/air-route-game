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

## World field, scopes and pruning (lane/world-sim)
- **Scope** (`RivalScope`: states, countries, transatlantic; presets in `config.ts SCOPES`): pacific, pacificNorthwest, hawaii, us, usTransatlantic, europe, europeTransatlantic, nordic. A rival only enters, seeds or re-bases inside its scope. Cross-Atlantic pairs (3500-9500 km) are for legacy carriers whose scope has `transatlantic`, and the aircraft must pass `canFlyRoute`. Airlines in older saves have no scope; `scopeOf` derives one from bases and archetype.
- **Field** (all fictional): the original five plus Ember Air and Cascade Connect stay West Coast (`pacific`). Added: Cardinal Air (legacy, ATL/DFW), Polaris Air (legacy, ORD/JFK), Sunbird Express (LCC, MCO/FLL), Rheinland Air (legacy, FRA/MUC), Gallia Air (legacy, CDG/NCE), Verdant Jet (LCC, DUB/STN), Tramontana Jet (LCC, BCN/BGY), Fjord Connect (regional, OSL/BGO, E175 first). Opening cash and seed-route counts are [E] picks, sized so margins land at the 5-15% target. Fleets come from `typePrefs` (real types from `packages/data`). Random entrants pick a US or European home region. `maxActive` 8 to 20, `newsLimit` 300 to 900.
- **Pruning**: `baseCandidates` caches the top `CANDIDATE_TOP_K = 60` markets per base by potential for each archetype, scope and closure epoch, so entry search is O(bases x K) instead of O(airports^2). `candidatePairs` removes routes already flown and recently exited markets. The starting networks of the new airlines come from `seedNetwork`, which requires true profit above zero.
- **Closures**: `applyAirportClosures` (weekly tick) drops routes at closed airports and re-bases the airline.
- Observed over 10 years: passive rival margins fall from about 15-17% (2015) to 4-12% (2023-24). Fjord Connect survives thinly. Kestrel Air shrinks to 1-4 routes (likely also before this lane). Tests: `rivals/field.test.ts`.

## World field (lane/rival-world, 20 Nov 2026; what new games use)
Owner design: about 50 competitors spread over the top 100 airports, the same hub and outstation rules as the player, real decisions (orders, route entries and exits, fare policies), decisions staggered so the cost stays bounded, and no invisible stand-in competitors. Code: `engine.ts` (functions after "Generated world field"), constants `config.ts WORLD_FIELD`. Selected with `startingScenario(..., { rivalField: "world" })`; the app's `newGame` passes it. The sim default stays "classic" so the calibration tests keep their reference world; old saves keep their field (`RivalsState.field` absent = classic).
- **Field.** `topAirportsByDemand`: the 100 open airports with the most potential weekly passengers (`baseWeeklyDemand`) to the 120 largest metros, among the 300 largest by metro population. 50 of them, chosen at random (seeded), get one airline each as its hub (`bases[0]`). Archetype mix legacy 35% / low-cost 40% / regional 25%. Starting network: 12-22 / 10-18 / 6-12 routes from the hub through `seedNetwork` (only routes whose true economics pay), cash USD 30M / 16M / 9M per route. A regional or low-cost airline with no paying market at its hub becomes a legacy carrier. Names are random fictional pairs from `WORLD_NAME_FIRST` x `WORLD_NAME_SECOND`. Aircraft: every type in service that year for the archetype's class (regional up to 110 seats, low-cost single-aisle 120-240, legacy from 100 seats), newest first (`worldTypePrefs`), so any start year works. Legacy carriers may fly up to 12,000 km.
- **Staggered decisions.** Each airline is given a week of an 8-week cycle at set-up (spread evenly, about 6 a week). Every week: route evaluation, P&L, pricing, deliveries. On its own week only: frequencies (`monthly`), exits (`quarterlyExits`), up to 2 new routes, an outstation, the fare policy, and once a year the fleet review.
- **Outstations.** From 8 routes on, a 20% chance per decision (at most 4) to open an outstation (USD 10M, `OUTSTATION_PARAMS`) at the busiest airport it already serves, if its flights there use at most half the cap. Routes may then start there, and flights touching it stay within 500 block hours a week (checked on entry and growth; `enforceStations` trims frequencies otherwise).
- **Orders.** A new route or a frequency rise that needs more aircraft than the fleet has places an order (deposit at order; delivery in 4-12 months for single-aisle, 8-18 for widebodies) and waits (`pending`, at most 4, dropped after 2 years); it opens on delivery. Replacements at the yearly review are still leased at once. The classic field still leases at once.
- **Fare policy.** One network fare level per airline (1 = standard): raised 3% when its flights run above 82% full, cut 3% below 72%, within 0.85-1.15. New route fares and the yield-management ceiling use it.
- **Startups.** Once a year, while fewer than 50 are flying, a 60% chance of a new low-cost or regional airline at a random top-100 airport (on the least busy decision week).
- **Competition for the player (no stand-ins).** `competitorItinerariesFor` gives every competing itinerary in a market: the rivals' nonstops plus their one-stops through one of their own bases when they fly both legs and the trip does not double back. A one-stop is priced at 92% of the benchmark fare x the airline's fare factor and level, on 30% of each leg's seats (assumption). The player's routes (`RouteWeekOptions.competitors`) and hub connections (full and fast tier) use exactly these; a market nobody else serves has only the outside option. Rivals' own markets no longer include a synthetic one-stop.
- **Measured** (seed 2015, two years): set-up 0.5 s; 50 airlines on 50 hubs, 534 routes and 601 aircraft at the start, 945 routes after two years, about 100 orders, 100 entries, 50 exits, 30 outstations; no bankruptcies; 34 ms per game day for the whole step (the classic field is cheaper).
- **Known limits.** Rivals carry no connecting passengers in their own P&L (their one-stops compete for the player's passengers only). With no stand-ins, the player's starting LAX routes run 100% full at their old fares until repriced. Rival profits are not yet balanced (some legacy carriers earn very high margins on markets nobody else serves). All figures above are design choices, not data.
- **Balance pass (20 Nov 2026, probe: seed 2015, passive player, medians of airline margin = profit over the last 52 weeks / annualised route revenue).** First version: rival routes ran 100% full (median) with every fare level at its cap, legacy margins 18-20%, the player 24-33% with its starting routes sold out. Cause: rivals sized a new route for 17-45% of the market (`entryShare`), the classic calibration where stand-ins carried the rest. Changes: world entry shares 0.5-0.7 of the carried market (`WORLD_FIELD.entryShare`) with the smallest aircraft that reaches it within the entry frequency; fare ceiling and fare-level cap 1.2 (`WORLD_FIELD.fareCeiling`, `fareLevel.max`); extra indirect cost +13 points legacy, +12 low-cost, +2 regional (`extraIndirectPct`). The player's starting routes are repriced once against the real field (`priceAgainstField` in scenario.ts: 75% local load, at most 1.4x the hand-tuned fare). Result in year 3: rival routes 83% full (median), margins low-cost 16%, legacy 15%, regional 4% (10th percentile -2%), no failures. The player's passive margin is about 40%: three of the four LAX starting routes have no rival in the generated field and run full even at 1.4x. All figures are calibration choices, not data.
- **Passive start pass (22 Nov 2026).** Incumbents on the player's starting markets at creation (`seedIncumbents`, `WorldIntensity.startCoverage` 0.65 / 0.8 / 1.0, `WORLD_FIELD.maxStartIncumbents` 4, `maxStartMarketsPerAirline` 2, `incumbentLongHaulKm` 3,000), and the player pays the legacy indirect share (15.5% of revenue) in the world field. Passive player, seed 2015, two years: net margin 14.4% / 11.5% / 2.8% on Easy / Medium / Hard (was 42-46%). Details: MODEL.md "Passive start in the world field".
