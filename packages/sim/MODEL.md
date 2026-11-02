# Sim model reference

All constants live in code (named exports) so they can be tuned without touching logic. This file documents
the formulas, every constant and the calibration targets. Units: km, USD, weekly passengers unless stated.
"One-way weekly" means passengers travelling A to B per week (the model is symmetric, B to A is equal).

Code map: `src/demand/market.ts`, `src/demand/choice.ts`, `src/finance/{ledger,fuel}.ts`,
`src/time/{clock,calendar}.ts`, `src/route/routeModel.ts` (glue), `src/index.ts` (`stepDay`).
Test fixtures (`src/testing/fixtures.ts`) are approximate and for tests only; the real data comes from `packages/data`.

## 1. Market size (`demand/market.ts`, `DEFAULT_MARKET_PARAMS`)

Potential annual-average one-way weekly demand for a pair, across all carriers, before the outside option:

    W = K * (Pa * Pb)^alpha * (sqrt(Ga * Gb) / Gref)^eta * (1 + tau * max(Ta, Tb)^rho) * (max(d, dmin)/1000)^-gamma * d^2/(d^2 + g^2)

P = metro population in millions, G = GDP per capita, T = tourismIndex, d = great-circle km.

| constant | value | meaning |
|---|---|---|
| K `scale` | 1790 | overall scale |
| alpha `popExponent` | 0.6 | sub-linear population effect |
| gamma `distExponent` | 0.4 | distance decay (distance in thousands of km) |
| dmin `minDistanceKm` | 150 | floor on distance in the decay term |
| g `groundSubstitutionKm` | 250 | short-haul damping (car/rail substitute) |
| eta `incomeExponent` / Gref `incomeRefUsd` | 0.6 / 75,000 | income elasticity |
| tau `tourismBoost` / rho `tourismPower` | 6 / 2 | tourism pulls the pair up convexly |

Calibration targets (fixtures: LAX 13.2M, SFO 6.5M, HNL 1.0M, tourism 0.45/0.5/1.0):
LAX-SFO 60-90k (got 74.7k), LAX-HNL 25-40k (got 33.1k), LAX-OGG 10.7k, SAN-OGG 4.5k, HNL-OGG 2.4k.
Note the targets are *potential* demand. After the outside option the carried volume is lower
(LAX-SFO about 77% carried, LAX-HNL about 85%, see `routeModel.test.ts` output). Real-world O&D is below the
potential figure, so the targets in the brief run high versus DOT data; scale K down for a realistic feel.
Re-tune: change K first (linear), then gamma/tau to shift the long-haul / Hawaii balance.

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

### Spill and recapture
1. Pass 0: unconstrained logit (including outside option) gives requests per itinerary and segment.
2. Capacity is per leg id (itineraries share legs). For each leg, factor = min(1, remainingSeats / requested).
   An itinerary is accepted at min(leg factors); its remainder is spill. Remaining seats are reduced; full itineraries close.
3. Recapture passes (`recapturePasses` = 3): each segment re-chooses `recapture` x spill among remaining open
   itineraries (logit without the outside option); the rest is lost. Spill from the last pass is `unservedSpill`.
4. Conservation identity (tested): `demand = captured + lostToOutside + lostNotRecaptured + lostNoSeats + unservedSpill`.

## 3. Route ledger (`finance/ledger.ts`, `LEDGER_PARAMS`)

`evaluateRoute` returns `lines[]` (key, label, weekly USD, human-readable formula) plus totals. Route = `weeklyFrequency`
departures each way, so flights/week = 2 x frequency. Passengers are both directions combined, capped at seats.

- Block hours = 1.04 d / (0.93 cruise) + 0.5. Feasible only if `1.04 d + 370 km <= range`, both runways >= needed, seats <= maxSeats.
  Infeasible: no flights or revenue; only fixed costs accrue (negative profit, margin -1).
- Revenue: per cabin pax x fare. Pax split across cabins proportional to seats x fill weight (F .75, J .8, W .88, Y 1.0), capped at seats.
  Ancillary 14 USD/pax.
- Fuel: `burn x 1.04 d x (0.92 + 0.16 LF) + taxi (450 kg narrow, 900 wide)`, kg / 3.04 kg/gal x price.
- Crew: block h x (pilots x 230 + FAs x 62). Pilots 2 (3 if block > 8 h, 4 if > 12). FAs = max(2, ceil(seats/40)).
- Landing/airport: 450 + 6.2 per seat per landing. Handling: 450 narrow / 900 wide per departure. Passenger services 11/pax.
- Maintenance: block h x seats x 6.0 (narrow) or 7.5 (wide).
- Ownership: lease = list price x 0.55 street x 0.75%/month; aircraft-equivalent = weekly block hours / (11 narrow or 13 wide h/day x 7);
  cost = equivalent x monthly lease x 12/52. (`ownership: "excluded"` when the real fleet is charged instead.)
- Distribution 6% of revenue; overhead 3% of revenue + 3,000 USD/week per route.
- Calibration: LAX-HNL 787-9 daily at 82% LF, Y 270 / W 460 / J 900: margin about 14%. A sold-out route has much higher margin.

### Fuel price series (`finance/fuel.ts`)
Hard-coded USD/gal anchors (fraction of year, price), linearly interpolated, clamped outside 2015-2026. West Coast
Jet-A, +0.35 for Hawaii. NOT sourced data; approximates: 2015 1.80 falling to 1.25 early 2016, 1.9-2.3 in 2018, 0.95 in
spring 2020, spike to 4.4 mid-2022, about 2.3 by 2025. Edit `JET_A_ANCHORS` to refine.

## 4. Clock (`time/clock.ts`)
Days per real second: `[0, 0.5, 1, 3, 7, 30]` for speeds 0-5. `advance(dtMs)` clamps dt to `maxDtMs` (1000), adds
`dt/1000 x rate` to an accumulator and returns the whole days to step. `AutoSlowHook.check(day, speed)` is called for each granted
day; a non-null result lowers speed to `maxSpeed`, clears the accumulator and ends the batch on that day.

## 5. Daily roll-up (`index.ts` `stepDay(SimState)`)
For each route: `simulateRouteWeek` (market on that day with seasonality, +/-1.5% seeded demand noise, player vs a synthetic rival
direct itinerary sized to annual demand at 80% LF, plus a rival one-stop for pairs >= 800 km at 0.85x fare) then `evaluateRoute`.
Daily revenue and cost = weekly / 7. Fleet: aircraft of the route type limit frequency (`operatedFraction = min(1, fleet/need)`
shared across routes of that type); owned aircraft are charged lease daily whether or not they fly. If the player owns no
aircraft of a type, the ledger charges notional fractional ownership (`notionalFleet: true` in `RouteReport`).
Corporate overhead 8,000/day + 600/aircraft/day (`DEFAULT_SIM_PARAMS`).
