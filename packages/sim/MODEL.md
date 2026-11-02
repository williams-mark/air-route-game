# Sim model reference

All constants live in code (named exports) so they can be tuned without touching logic. This file documents
the formulas, every constant and the calibration targets. Units: km, USD, weekly passengers unless stated.
"One-way weekly" means passengers travelling A to B per week (the model is symmetric, B to A is equal).

Code map: `src/demand/market.ts`, `src/demand/choice.ts`, `src/finance/{ledger,fuel}.ts`,
`src/time/{clock,calendar}.ts`, `src/route/routeModel.ts` (glue, rivals, hub connections), `src/state.ts` (SimState),
`src/commands.ts` (`applyCommand`, `drainEvents`), `src/fleet/{layout,maintenance,scheduler}.ts`, `src/scenario.ts`, `src/index.ts` (`stepDay`).
Test fixtures (`src/testing/fixtures.ts`) are approximate and for tests only; the real data comes from `packages/data`.

## 1. Market size (`demand/market.ts`, `DEFAULT_MARKET_PARAMS`)

Potential annual-average one-way weekly demand for a pair, across all carriers, before the outside option:

    W = K * (Pa * Pb)^alpha * (sqrt(Ga * Gb) / Gref)^eta * (1 + tau * max(Ta, Tb)^rho) * (max(d, dmin)/1000)^-gamma * d^2/(d^2 + g^2)

P = metro population in millions, G = GDP per capita, T = tourismIndex, d = great-circle km.

| constant | value | meaning |
|---|---|---|
| K `scale` | 1780 | overall scale (was 3700 before the metro split) |
| alpha `popExponent` | 0.47 | sub-linear population effect |
| gamma `distExponent` | 0.25 | distance decay (distance in thousands of km) |
| dmin `minDistanceKm` | 150 | floor on distance in the decay term |
| g `groundSubstitutionKm` / n `groundPower` | 150 / 3 | short-haul damping d^n/(d^n+g^n). Mild on purpose: the choice model's driving option already removes most short-haul passengers, so a strong damping here double-counted (LAX-SAN) |
| eta `incomeExponent` / Gref `incomeRefUsd` | 1.28 / 75,000 | income elasticity |
| tau `tourismBoost` / rho `tourismPower` | 1.7 / 3 | tourism pulls the pair up (only strongly touristy ends) |
| `interislandBoost` | 12.5 | multiplier for HI-HI pairs (no road, frequent business/VFR trips) |
| `metros` | `DEFAULT_METROS` | multi-airport catchments, section 1a |
| `growthPerYear` | 0.025 | compound market growth from 2015 (applied in `marketOnDay`; no pandemic shock is modelled) |

**Water-crossing exemption.** `hasSurfaceAlternative(a, b)` is true only for CA-CA pairs. The ground-damping factor applies only
there; HI-HI and HI-CA pairs get factor 1 (no practical surface alternative). The itinerary-choice driving option already
required CA-CA. The interisland boost then lifts HI-HI pairs because a plain gravity model on island populations is far
below the real interisland market.

Calibration targets are all-carrier *potential* one-way weekly passengers (DOT-scale), summed over the airports of each metro (printed by
`src/integration.test.ts`). Real @arg/data airports, before this lane (each airport the whole metro) and after (metro split, section 1a):

| pair (metro totals) | target | before | after |
|---|---|---|---|
| LA airports - SF airports | 35-50k | 113k (LAX-SFO alone 44k) | 37.7k (LAX-SFO alone 22.6k) |
| SMF - LA airports | 8-14k | 23.3k | 13.4k |
| SAN - SF airports | about 8-14k | 23.9k | 15.8k (a little rich) |
| LA - HNL | 8-14k | 10.6k | 11.0k (LAX-HNL alone 10.9k) |
| LA - OGG | 4-7k | 4.2k | 4.0k |
| HNL-OGG | 25-40k | 32.8k | 29.4k |
| SF - HNL | 5-12k | 7.9k | 8.5k |
| HNL-KOA / HNL-LIH | 10-25k | 18.3k / 21.3k | 17.5k / 18.6k |
| LA - SAN (all airports) | small | 6.0k | 16.3k potential, but 75-80% drives (LAX-SAN carried about 1.3-3k) |

Fixture airports (unit tests only) are single airports, so `market.test.ts` evaluates them with `metros: null` and metro populations.
The parameters came from a random/local search against the targets above (with a small penalty for leaving the earlier values), then hand
rounding; they are not an estimate from data. The pair structure of the data (SAN and SMF are small metros with modest GDP) limits how far
SAN-SFO can fall without breaking the Hawaii pairs; it stays about 15% above the band. Re-tune: K first (linear), then alpha, gamma;
`interislandBoost` only moves HI-HI.

### 1a. Metro catchments (`demand/metros.ts`)
`DEFAULT_METROS`: LA = LAX, SNA, ONT, BUR, LGB with base shares 0.78 / 0.10 / 0.044 / 0.042 / 0.034 and SF = SFO, OAK, SJC with 0.70 / 0.16 / 0.14.
Shares are rounded estimates of 2015 passenger traffic in each metro (FAA/DOT enplanements from memory; NOT sourced data in packages/data, tuning weights only).
Metro population is the sum of the `metroPopulation` of non-overlapping anchor MSAs (LA: LAX 13.3M + ONT 4.45M = 17.75M; SF: SFO 4.65M + SJC 1.98M = 6.63M), checked by a test.

    W(a, b) = W_metro(pop(metro a), pop(metro b), d_ab) * share_a(d) * share_b(d)

so the sum over airport pairs of two metros equals the metro-to-metro volume. Income and tourism use each airport's own values. Long routes concentrate on the
dominant airport: weights are share^phi renormalised within the metro, phi = 1 + 1.2 min(1, (d/2500)^2), so LAX carries about 95% of LA-Hawaii but about 74% of LA-SF.
Single-airport metros (SAN, SMF, HNL ...) have share 1. LAX-SFO alone is 22.6k (real about 18-21k).

### Segments (`segmentShares`)
With t = max(Ta,Tb)^1.5 and dd = 1 / (1 + (d/4000)^1.5), raw weights, then normalised:

    business = 0.42 (1 - 0.7 t) (0.55 + 0.45 dd)
    leisure  = 0.30 + 0.32 t
    vfr      = (0.15 + 0.06 min(1, d/2500)) (1 - 0.3 t)
    budget   = 0.14 + 0.06 (1 - t)

LAX-SFO: business 0.30 / leisure 0.39 / vfr 0.14 / budget 0.17. LAX-HNL: 0.10 / 0.62 / 0.15 / 0.14.

### Seasonality (`seasonality`)
Four 12-month profiles (each normalised to mean 1, linearly interpolated between month centres so daily values
are smooth). `SEASON_PROFILES`:
- mainlandLeisure `[.88 .90 1.0 1.0 1.02 1.12 1.16 1.10 .96 .96 .98 1.02]`
- hawaiiLeisure `[.95 .90 1.05 1.0 .93 1.15 1.25 1.15 .80 .80 .90 1.25]` (summer + December peaks)
- business `[.96 1.02 1.06 1.05 1.05 1.0 .90 .92 1.05 1.08 1.05 .86]`
- vfr `[.88 .88 .95 .97 .98 1.08 1.12 1.04 .92 .95 1.12 1.20]`

Leisure and budget blend mainland and Hawaii profiles with weight 1 if either end is in HI, else 0.3 x pair tourism.
Segment demand on a day = W * share * seasonality(day, segment).

## 2. Itinerary choice (`demand/choice.ts`, `DEFAULT_CHOICE_PARAMS`)

Per segment s, itinerary i has utility

    U = -fare/theta_s  -  VOT_s * elapsedHours / theta_s  -  VOT_s * (connectPenaltyMin + pMisconnect * misconnectDelayMin)/60 / theta_s
        + lambda_s * ln S(f_eff; f0_s, k)  +  qw_s * (quality - 0.5)

Shares are multinomial logit over all open itineraries plus the outside option `ln(exp(-noTravelGC/theta) + exp(-driveGC/theta))`.

| constant | business | leisure | vfr | budget |
|---|---|---|---|---|
| VOT (USD/h) | 70 | 24 | 18 | 10 |
| theta (USD per util) | 60 | 45 | 40 | 25 |
| lambda (frequency weight) | 1.0 | 0.75 | 0.7 | 0.6 |
| f0 (weekly freq at 50% fit) | 12 | 6 | 5 | 5 |
| qw (quality weight) | 1.2 | 0.8 | 0.6 | 0.4 |
| noTravelMultiplier | 1.6 | 1.35 | 1.4 | 1.3 |
| recapture rate | 0.7 | 0.6 | 0.5 | 0.55 |

- Schedule fit `S(f) = f^k / (f^k + f0^k)`, k = 2.5. Weight in the logit is `S^lambda`, so at low frequency share grows like
  `f^(k*lambda)` (exponent 1.5 to 2.5, superlinear) and saturates once f is well above f0.
- Frequency of a connection = min(leg frequencies) x 0.6 (`connectionFrequencyFactor`).
- Elapsed time = sum of block minutes + layover. Layover per connection = 60 + min(180, 0.1 x headway) minutes where
  headway = 10080 / min leg frequency.
- Misconnect probability per connection = 0.05 + 0.10 x max(0, (90 - layover)/90). Delay if missed 300 min.
  Fixed connection hassle 60 min-equivalent. Both are priced at the segment's VOT.
- Outside option: benchmark generalised cost GC = benchmarkFare(d) + VOT * (1.04 d / 800 + 0.6); not travelling costs
  `noTravelMultiplier x GC`. Driving (only CA-CA) costs 0.14 USD/km x (1.25 d) + 0.8 x VOT x (1.25 d / 95 km/h).
- `benchmarkFare(d) = 64 + 0.265 d^0.8` (LAX-SFO about 105, LAX-HNL about 270): economy-equivalent yield curve; also the rival's fare.

### Fare scaling, seat share and soft spill (route model switches)
`ROUTE_CHOICE_PARAMS` = `DEFAULT_CHOICE_PARAMS` plus three switches (all off in the plain defaults so the choice unit tests stay exact):
- `fareScaleExponent` = 1: the fare term uses `theta_eff = theta x (benchmarkFare(d) / 105)^1`, i.e. constant *percentage* elasticity across
  distances. At the benchmark fare the logit elasticity is `-fare / theta`: business -1.75, leisure -2.3, VFR -2.6, budget -4.2 (times
  `1 - share`). Without it a long-haul fare change of 20% (USD 54) was punished like USD 54 on a short hop.
- `capacityShareExponent` = 1: adds `ln(seat share)` to each itinerary's utility, so an itinerary with 10% of the seats gets about 10% of the
  passengers at equal fare and quality. Previously every carrier with a saturated schedule fit looked identical, so a 35/wk player
  took the same share as a rival with 400/wk and sold out at any fare.
- `spillCv` = 0.2: Gaussian spill. A leg with mean requests `r` and capacity `C` carries `E[min(D, C)]` with `D ~ N(r, (0.2 r)^2)`
  (`carriedFraction`). Load factor approaches 100% gradually; with `spillCv = 0` the old hard cap applies.

### Spill and recapture
1. Pass 0: unconstrained logit (including outside option) gives requests per itinerary and segment.
2. Capacity is per leg id (itineraries share legs). For each leg, factor = `carriedFraction(requested, remainingSeats, spillCv)` (= min(1, remaining / requested) when `spillCv = 0`).
   An itinerary is accepted at min(leg factors); its remainder is spill. Remaining seats are reduced; full itineraries close.
3. Recapture passes (`recapturePasses` = 3): each segment re-chooses `recapture` x spill among remaining open
   itineraries (logit without the outside option); the rest is lost. Spill from the last pass is `unservedSpill`.
4. Conservation identity (tested): `demand = captured + lostToOutside + lostNotRecaptured + lostNoSeats + unservedSpill`.

## 3. Route ledger (`finance/ledger.ts`, `LEDGER_PARAMS`)

`evaluateRoute` returns `lines[]` (key, label, weekly USD, human-readable formula) plus totals. Route = `weeklyFrequency`
departures each way, so flights/week = 2 x frequency. Passengers are both directions combined, capped at seats.

- Block hours = 1.04 d / (0.93 cruise) + 0.65. Feasible only if `1.04 d + 370 km <= range`, both runways >= needed, seats <= maxSeats.
  Infeasible: no flights or revenue; only fixed costs accrue (negative profit, margin -1).
- Revenue: per cabin pax x fare. Pax split across cabins proportional to seats x fill weight (F .75, J .8, W .88, Y 1.0), capped at seats.
  Ancillary 14 USD/pax.
- Fuel: `burn x 1.04 d x (0.92 + 0.16 LF) + taxi (450 kg narrow, 900 wide)`, kg / 3.04 kg/gal x price.
- Crew: block h x (pilots x 340 + FAs x 85). Pilots 2 (3 if block > 8 h, 4 if > 12). FAs = max(2, ceil(seats/40)).
- Landing/airport: 800 + 7.5 per seat per landing. Handling: 700 narrow / 1400 wide per departure. Passenger services 13/pax.
- Maintenance: block h x seats x 3.5 (narrow) or 4.5 (wide) (the A-D checks of section 7 are charged on top, so the route line is only line maintenance and parts).
- Ownership: lease = list price x 0.55 street x 0.75%/month; aircraft-equivalent = weekly block hours / (11 narrow or 13 wide h/day x 7);
  cost = equivalent x monthly lease x 12/52. (`ownership: "excluded"` when the real fleet is charged instead.)
- Distribution 6% of revenue; overhead 6% of revenue + 5,000 USD/week per route.
- Premium cabins: unpriced J/F/W use `fare Y x multiplier x premiumDistanceFactor(d)` (0.55 at 0 km to 1.0 at 3500 km, so a 12-seat domestic J sells at about 2x Y on LAX-SFO and 3.2x on LAX-HNL).
  A cabin priced above the going multiple m0 gets `fillScale = (m0/m)^2` and can sell only that fraction of its seats, so premium revenue peaks near the going fare
  and falls as 1/m (fixes the "J fare x 400 is free money" exploit found by the bots, BALANCE.md).

### CASM / RASM sanity (route level, ownership charged fractionally, starting fares, four seasons; `src/economics.test.ts`)
US majors 2015-2019: CASM about 12-15 cents on a 1,000 mile stage, 18-25 cents on 350 miles, 8-10 cents transpacific; margins 5-15%. Cents per ASM mile:

| route | type | miles | /wk | fare | LF | CASM | RASM | margin | fuel | crew | airport+handling | pax svc | maint | ownership | distrib+overhead |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LAX-SFO | 737-800 | 338 | 42 | 105 | 69% | 20.5 | 25.6 | 20% | 2.15 | 2.77 | 4.96 | 2.66 | 1.42 | 3.29 | 3.19 |
| SMF-LAX | A320 | 373 | 14 | 108 | 72% | 19.9 | 25.0 | 20% | 2.16 | 2.64 | 4.69 | 2.52 | 1.36 | 3.23 | 3.32 |
| SAN-SFO | 737-800 | 447 | 10 | 115 | 68% | 17.3 | 20.9 | 17% | 2.04 | 2.45 | 3.75 | 1.99 | 1.26 | 2.91 | 2.85 |
| LAX-SAN | A320 | 109 | 14 | 62 | 79% | 51.8 | 57.6 | 10% | 3.25 | 5.51 | 16.0 | 9.44 | 2.83 | 6.74 | 8.01 |
| LAX-HNL | 777-200ER | 2553 | 14 | 270 | 77% | 8.4 | 10.5 | 20% | 2.13 | 0.95 | 0.55 | 0.39 | 1.01 | 2.10 | 1.28 |
| LAX-OGG | 757-200 | 2483 | 7 | 266 | 64% | 7.1 | 8.0 | 11% | 1.81 | 1.38 | 0.60 | 0.34 | 0.83 | 1.14 | 1.03 |
| HNL-OGG | A319 | 101 | 56 | 80 | 67% | 57.0 | 65.7 | 13% | 4.34 | 6.65 | 18.75 | 8.64 | 3.01 | 7.41 | 8.22 |

Before the recalibration the same routes showed 42-51% margins before ownership (14-37% after). The remaining route margins are contribution
before corporate overhead and idle aircraft; the airline as a whole earns about 10% on the passive starting fleet (BALANCE.md). Sold-out routes earn 30%+.

### Fuel price series (`finance/fuel.ts`)
Hard-coded USD/gal anchors (fraction of year, price), linearly interpolated, clamped outside 2015-2026. West Coast
Jet-A, +0.35 for Hawaii. NOT sourced data; approximates: 2015 1.80 falling to 1.25 early 2016, 1.9-2.3 in 2018, 0.95 in
spring 2020, spike to 4.4 mid-2022, about 2.3 by 2025. Edit `JET_A_ANCHORS` to refine.

## 4. Clock (`time/clock.ts`)
Days per real second: `[0, 0.5, 1, 3, 7, 30]` for speeds 0-5. `advance(dtMs)` clamps dt to `maxDtMs` (1000), adds
`dt/1000 x rate` to an accumulator and returns the whole days to step. `AutoSlowHook.check(day, speed)` is called for each granted
day; a non-null result lowers speed to `maxSpeed`, clears the accumulator and ends the batch on that day.

## 5. Daily roll-up (`index.ts` `stepDay(SimState)`)
For each route: `simulateRouteWeek` (market on that day with seasonality, +/-1.5% seeded demand noise, player vs 1-3 synthetic rival carriers
(`buildRivals`, below) plus a rival one-stop for pairs >= 800 km at 0.85x fare) then `evaluateRoute`.
Daily revenue and cost = weekly / 7. (Fleet handling is superseded by section 7.) Fleet: aircraft of the route type limit frequency (`operatedFraction = min(1, fleet/need)`
shared across routes of that type); owned aircraft are charged lease daily whether or not they fly. If the player owns no
aircraft of a type, the ledger charges notional fractional ownership (`notionalFleet: true` in `RouteReport`).
Corporate overhead 8,000/day + 600/aircraft/day (`DEFAULT_SIM_PARAMS`).

### Synthetic rivals (`buildRivals`, `RouteModelConfig`)
**Sizing on carried demand (`route/rivalSizing.ts`).** Rivals used to be sized on the potential market, which on drivable pairs is mostly lost to the driving option (LAX-SAN carried 23%), so they flew nearly empty and diluted the player to a 17% load factor. A probe run with the rivals alone measures the share of demand an all-rival market carries (`airShare`); `buildRivals` then receives `baseWeekly x airShare`. Long-haul pairs carry 75-80%, so coverage moved from 0.6 to 0.8 of carried demand (long-haul results unchanged). Costs one extra choice run per route per day.

Rival count by annual one-way demand *that flies* (synthetic rivals only; real rivals: RIVALS.md) (see below): up to 1,500/wk 1 rival, up to 6,000/wk 2, above 3 (`rivalCountBands`). Combined rival seats =
`carriedWeekly x rivalMarketCoverage (0.8) / rivalTargetLoadFactor (0.8)`, split 45/33/22% (profiles: fare x1.00/0.96/1.05, quality 0.55/0.5/0.45),
aircraft of 90-250 seats by distance and market size, minimum 2 departures a week each. The one-stop rival is sized at a quarter of the
rival direct frequency. Coverage 0.6 (not 1.0) because only about 75-80% of potential demand is carried after the outside option, so
rivals alone run about 80% LF and a new player takes a share by diluting them.

Calibration printouts (LAX-SFO 35/wk B737-800, day 100; `integration.test.ts`): load factor at fare multiples of market (USD 105)
0.9x 93%, 1.0x 80%, 1.1x 64%, 1.2x 52%, 1.35x 37%, 1.5x 27%, 1.75x 16%, 2.0x 9%. At the market fare: LAX-SFO 80%, LAX-HNL (14/wk 767-300ER) 93%,
LAX-OGG (7/wk 757-200) 66%, HNL-OGG (56/wk A319) 75%. Before this change LAX-SFO was 100% sold out at every fare from 0.6x to 1.5x.

## 6. Commands (`commands.ts`)
`applyCommand(state, cmd) -> { state, result }` is pure. `result` is `{ ok: true, kind, ... }` or `{ ok: false, error, message }` with a
typed `CommandErrorCode` (`unknown_airport`, `same_airport`, `unknown_type`, `invalid_frequency`, `invalid_fare`, `out_of_range`,
`runway_too_short`, `no_suitable_aircraft`, `duplicate_route`, `unknown_route`, `invalid_count`, `invalid_layout`, `type_unavailable`,
`insufficient_cash`, `invalid_speed`). Successful commands queue a `notice` SimEvent. `drainEvents(state) -> { state, events }` takes the
queue (ticks, finance snapshots and notices from `stepDay`, oldest first; capped at `eventQueueLimit` 2000). `state.events` still holds only the last step's tick+finance.
- `setSpeed`: stored in `state.speed` (0..5).
- `openRoute`: airports exist and differ; type exists; frequency whole 1..140; Y fare > 0 (other cabins positive if given); no duplicate pair (either
  direction); range (`1.04 d + 370 km <= range`) and both runways; at least one non-stored aircraft that can fly it exists (the requested type, else a
  same-size-class substitute with a warning). Ids are `route-N`.
- `updateRoute`: merges the patch, revalidates (fleet check only if pair or type changed). `closeRoute`: removes the route and its report.
- `orderAircraft`: count whole 1..200; type not out of production (`endYear >= year`) and `introYear <= year + 3`; layout legal (<= maxSeats; empty layout = default).
  Discount off list `min(40%, 8% + 6% x ln(count))` (1 aircraft 8%, 10 22%, 100 36%). Deposit 15% of the net order value is paid from cash at order and credited back on each
  aircraft's delivery, because the financed price is already charged through the lease-equivalent ownership cost (`monthlyOwnershipUsd`). Delivery lead time is
  drawn per order from a seeded RNG: narrowbodies 6-18 months, widebodies 12-30 months, aircraft in one order staggered by 0.5 (narrow) / 1 (wide) month and
  never later than the maximum; a type not yet in service is delivered no earlier than 1 January of its `introYear` (so a 2015 order for a 2017 type waits longer than 18 months).
  Aircraft are created at once with status `delivery` (no lease, not scheduled), and become `active` with age 0 on the delivery day.

## 7. Fleet, scheduler and maintenance
Daily order in `stepDay`: deliveries, finished checks, checks falling due, scheduling, route economics, utilisation counters, costs.
- **Scheduler** `assign(routes, fleet, {airports, types})`: only `active` aircraft. Routes are served widebody-first, then by weekly block-hour need. Per route, whole round
  trips are taken from aircraft of the requested type first (smallest aircraft with room for all of it, else the one with the most room), then from other feasible types
  of the same size class (`substitutedFrequency`). Capacity per aircraft = 9.5 (narrow) / 12.5 (wide) block hours a day. Range and both runways must allow the type
  (`typeCanServe`). Output per route: `scheduledFrequency`, `underSupplied` (requested minus scheduled), `aircraftIds`, `blockHoursPerWeek`; per aircraft: hours and assignments.
  `RouteReport.scheduling` carries it and `operatedFraction = scheduled / requested`. Economics are evaluated with the requested type even when substitutes fly (approximation);
  the first flying aircraft supplies the cabin layout. Notices fire when a route becomes under-supplied and when it recovers.
- **Notional fleet**: with `params.notionalFleet` true (default; sandbox and old tests) a route whose type the player owns none of is flown by a notionally leased fleet. `startingScenario` sets it false.
- **Flight hours / cycles**: each day an aircraft adds `blockHoursPerWeek / 7` to `hoursSinceCheck` (A..D) and to `fleetMeta.flightHours`, and `2 x round trips / 7` cycles.
- **Checks** (`MAINTENANCE_PARAMS`): A every 500 flight hours (overnight: cost, no downtime); B 180 days, 3 days out; C 540-720 days (seeded per aircraft), 21 days; D 2190-3650 days (6-10 years), 60 days.
  A heavier check resets the lighter ones. Costs are estimates: A 12k/28k, B 40k/90k, C 0.9M/2.4M, D 3.5M/9M USD (narrow/wide) scaled by list price relative to a 100M narrow or 270M wide reference.
  A due B/C/D check is *deferred* while pulling the aircraft would reduce scheduled round trips (re-running `assign` without it), for at most `graceDays` = 30; after that it is forced and the route
  shows as under-supplied. Spares and same-class substitutes cover without any deferral. Notices on every check start, finish, deferral and forced removal.
- Delivered aircraft pay lease-equivalent ownership plus 600/day overhead whether flying or not; aircraft awaiting delivery pay nothing.

## 8. Starting scenario (`startingScenario(airports, types, seed)`)
Skybridge Pacific, LAX, day 0 = 2015-01-01, USD 150M. Fleet 3x B737-800, 1x A320, 2x B757-200, 2x B777-200ER (ids from `@arg/data`), ages 2-14 years, default cabins
(`defaultLayout`). It was 13 aircraft (6 737, 2 A320, 2 757, 1 767, 2 777): the four routes need 1.5 / 0.3 / 1.1 / 1.8 aircraft at 11 h/day, so the extra four 737s, one A320 and the 767 sat idle
paying about USD 40M a year of lease and made the company margin negative once costs were realistic. One spare 737 remains so an SFO check does not under-supply the route.
Routes (round trips a week, type): LAX-SFO 42 (737-800), LAX-SAN 14 (A320), LAX-HNL 14 (777-200ER), LAX-OGG 7 (757-200); fares from `startingFare`: the benchmark curve, except drivable
sectors under 400 km, which fall linearly to 60% of it at zero distance (LAX-SAN 62 instead of 81 USD).

LAX-SAN choice of fare and frequency (one A320, ownership charged, mean of four seasons, profit USD k/wk / load factor %; first row of fares is the fare in USD):

| freq \ fare | 55 | 62 | 69 | 81 |
|---|---|---|---|---|
| 8 | 1 / 84 | -4 / 71 | -12 / 58 | -26 / 41 |
| 10 | 10 / 89 | 6 / 76 | -4 / 63 | -22 / 46 |
| 14 | 21 / 91 | 16 / 79 | 5 / 67 | -19 / 49 |
| 18 | 20 / 88 | 15 / 76 | 1 / 65 | -22 / 59 |

Profit is maximised at 14 to 16 a week at any fare, and the benchmark 81 USD fare loses money at every frequency, so the 17% load factor was a pricing problem (and the rival oversizing above), not a frequency problem.
62 USD at 14/wk gives 73% local load factor and 78% with the feeder traffic for HNL/OGG/SFO (day 30), USD +16k a week. Startup state: passive airline margin 5-15% a year (see section 8a for the version with the real rival field).

### 8a. Starting network with the real rival field (lane/reconcile)
Real rival itineraries replace the synthetic rivals on every pair a rival flies (RIVALS.md). Day 30, seed 2015: LAX-SFO LF 72% (113 through passengers each way a week), LAX-SAN 80% (90), LAX-HNL 76% (112), LAX-OGG 79% (25).
Passive company margin by year (seed 2015): 14.8, 12.1, 1.0, 5.2, 5.2, 10.9, 5.5 (2015-2021), -5.3 in the 2022 fuel spike, 9.1, 14.8; seeds 1-5 average 7-11% over ten years. Ember Air entering LAX-SFO in 2017 is the dip.
Before this reconciliation the pairs with a single real rival ran 100% full and sold no seats to hub passengers.

## 9. Hub connections (`route/routeModel.ts`)
`evaluateHubConnection({ origin, hub, destination, leg1, leg2, types, day, ... })` (e.g. SAN-HNL via LAX): local traffic on each leg is simulated first with `simulateRouteWeek` and keeps its seats (local priority);
the through market is `marketOnDay(origin, destination)` and the player's itinerary uses both legs with only the *remaining* seats as leg capacity, competing with the synthetic rival direct(s) and one-stop. The existing
connection logic applies (`connectionFrequencyFactor` 0.6 on min leg frequency, layover, misconnect, `connectPenaltyMin`). Through passengers appear in `legs[i].connectingPassengers` and in each leg's load factor.
`networkContribution(conn)` prorates the through fare (default 92% of benchmark) to the legs by great-circle distance (`leg1ProrateShare = d1 / (d1 + d2)`), adds each leg's own ledger revenue, and recomputes leg costs
with the extra passengers on board; `proratedTotal` equals `throughRevenue`. `stepDay` includes hub passengers (section 9a).

## Offers (`offers/`, `OFFER_PARAMS`)
`SimState.offers` holds open offers; `offerLog` maps `kind:typeId` to the last day offered (cooldown). `stepDay` calls `stepOffers` last: expire (notice) and warn 7 days before, roll launch-order delays, then draw at most one new offer.
Generation is a pure function of (world seed, day): P(new offer today) = 2/30.4375 (about 2 a month, Poisson, so months of 0-5 happen), capped at 8 open. Kind weights launch .28, end-of-life .24, flash sale .20, used .28, restricted to kinds with
an eligible type; a type is not re-offered the same kind within 365 / 270 / 120 / 90 days. Offer id is `offer-<day>`.

| kind | eligible types | discount vs list | deposit | first delivery | quantity | expiry |
|---|---|---|---|---|---|---|
| launch | introYear 0.75-4 years ahead | 15-30% | 6-12% | later of intro and today+180d, plus 120-360d (later than a normal order); gap 25-40d narrow, 45-70d wide | 4-20 narrow, 2-8 wide | 60-120d |
| endOfLife | endYear in [this year, this year+2] | 10-25% | 15% | today+90-240d narrow, +150-330d wide | 2-10 narrow, 1-4 wide | 30-75d |
| distressed | in service, not ended > 4 years ago | 20-40% | 20% | today+7-45d, gap 5-14d | 1-6 narrow, 1-3 wide | 14-45d |
| used | in service for at least 1 year | age-based, see below | 15% | today+14-60d | 1 (75%) or 2-3 | 20-60d |

- Launch orders carry a delay risk (35-60%). One roll per order, seeded by (seed, order id), made when the first undelivered aircraft is within 120 days of delivery: on a slip all undelivered aircraft move 1-12 months and a
  "Delivery delayed" notice is emitted; otherwise an "on schedule" notice.
- Distressed lots are 0-2.5 years old; 40% carry an unusual cabin (single-class high-density, or premium-heavy), always validated against the type's seat limit. Seller names are fictional.
- Used: age 2 to min(22, years since introYear + 1); price / list = clamp(0.85 exp(-0.075 age) x (1 +- 8%), 0.08, 0.8); flight hours = age x 3000 +- 15%. Aircraft arrive with that age and hours.
- `acceptOffer(offerId, quantity)`: needs 1 <= quantity <= remaining and cash >= deposit; creates an `AircraftOrder` (with `offerId`) and aircraft in `delivery` status; partial acceptance leaves the rest open. `dismissOffer` removes it.
  Deposit is credited back at delivery as for ordinary orders. Because that makes the price itself cash-neutral, offer orders set `ownershipFactor = net price / list`, which scales the lease-equivalent ownership cost of those aircraft in `stepDay` step 6.
  (Ordinary orders do not do this yet; their volume discount only changes the deposit.)


### 9a. Hub passengers in `stepDay` (`route/network.ts`, `evaluateNetwork`)
After the local route weeks, every airport on two or more player routes is a hub. For each pair of spoke routes whose far ends differ and have no direct player route (SAN-HNL and SAN-OGG via LAX, SMF-HNL via LAX,
SFO-HNL via LAX ...) `evaluateHubConnection` runs with the already simulated local weeks (`week1/week2`). Local passengers keep their seats; markets are served largest first (at most `NETWORK_LIMITS.maxMarkets` = 12 with potential at least 300/wk) and each takes seats from
what earlier markets left (`reservedSeats1/2`), so a seat is never sold twice. Revenue: through fare (92% of benchmark) prorated by distance, both directions (`networkContribution`; the per-market proration sums to the through revenue, tested).
Cost: the leg's ledger is re-run with the extra passengers aboard; the increase, minus the revenue-linked lines (distribution, overhead) recomputed on the through revenue rather than the leg fares, is booked as "Cost of carrying connecting passengers".
The route's `evaluation` (load factor, passengers, revenue, costs, margin, ledger lines) and the daily revenue and costs include the result; `RouteReport.connecting` lists the markets. Starting network, day 30 (through passengers each way a week): LAX-SFO 129, LAX-SAN 107 (SFO-SAN 36, SAN-HNL 43, SAN-OGG 28), LAX-HNL 123, LAX-OGG 41; load factors 65 / 78 / 73 / 60%.

## Cabin (`cabin/`, `CABIN_PARAMS`, `REFIT_PARAMS`)
- `cabinGeometry(type)`: cabin width/length estimates per type (header comment lists sources and confidence); usable length = length minus galley/lavatory/door allowance (regional 3 m, narrow 4.5 m, wide 8 m).
- `validateCabinLayout(type, layout)`: one section per class; seats across from `allowedAcross` (arrangement labels such as 2-4-2); pitch limits per class; seats <= `maxSeats` (stands in for the exit limit); rows x pitch + 0.35 m per divider <= usable length.
- `layoutEffects`: class comfort = 0.6 x pitch/benchmark + 0.4 x seat width/benchmark; overall comfort weights seats F4, J3, W1.8, Y1. All effects are relative to `defaultLayout(type)`, so the default cabin is neutral. `qualityIndex` = 0.5 + 1.0 x (comfort - ref) + 0.25 x (premium weight - ref), clamped 0.35-0.7; it replaces the constant 0.5 player quality in `simulateRouteWeek` (choice quality term: 0.4-1.2 utility per 1.0). Service cost multiplier (catering per pax, F6/J3.5/W1.5/Y1) and crew seat equivalent (seats per FA F10/J16/W28/Y40) feed `evaluateRoute` through the optional `cabinCost`.
- Per-cabin demand: `classDemandShares` (segment mix x class propensity x stage-length factor 0.6-1.3), `allocateByDemand` (excess spills down a class), `cabinFillRatios` (multiplier on the ledger's static cabin fill weights, exactly 1 for the default layout). Limitation: choice still sees one Y fare; at very high overall load factors overflow fills premium cabins anyway.
- `refitAircraft` (`CabinCommand`): validates the layout, charges per seat plus a fixed fee (REFIT_PARAMS), sets the aircraft to maintenance for 5 (narrow) or 14 (wide) days via `fleetMeta.maintenance.refit`.
