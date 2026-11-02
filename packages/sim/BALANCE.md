# Balance findings (lane/balance)

Tooling: `pnpm --filter @arg/sim bots [--games N] [--years Y] [--seed S]` plays N seeded headless games from `startingScenario` for Y years (default 12 games x 10 years) with six
strategies in rotation (`src/bots/strategies.ts`): `passive` (autopilot), `random` (random feasible routes, frequencies, fares, occasional orders), `greedy` (opens big-metro routes, steers fares to a 78%
load factor, adds frequency where full, closes losers, orders when under-supplied), `yolo` (large random orders and many extreme-fare routes), `fareProbe` (random extreme premium and economy fares on every route)
and `orderChurn` (repeated ordering and route open/close). Bankrupt = cash below zero for 60 consecutive days. Exploit = cash above 50x the starting cash (USD 7.5B), reported with the best year multiple and best
route margin. `src/bots/bots.test.ts` runs 20 half-year games (about 2 s) and checks determinism, no crash, no exploit.

## Latest run (18 games, 10 years each, 2015-2025, seeds 1-18, real AI rivals active)
Bankruptcies 14/18, exploits 0, crashes 0. Runtime: 81 s for all 18 games, mean 4.5 s, max 11.5 s per 10-year game (target: under 60 s per game).

| strategy | games | bankrupt | final cash USD M (min / median / max) | mean s |
|---|---|---|---|---|
| passive | 3 | 0 | 326 / 345 / 450 | 8.9 |
| random | 3 | 3 | -15 / -8 / -7 | 2.3 |
| greedy | 3 | 2 | -9 / -5 / 213 | 8.6 |
| yolo | 3 | 3 | -37 / -28 / -21 | 1.8 |
| fareProbe | 3 | 3 | -18 / -15 / -12 | 1.6 |
| orderChurn | 3 | 3 | -19 / -17 / -6 | 3.7 |

Reading: with competitors that react, random and greedy play now mostly fail; the passive starting airline still more than doubles its cash (7-11% average margin, dips when a new rival enters its trunk routes
and in the 2022 fuel spike). The greedy heuristic is worse than doing nothing in two of three seeds. No run approaches the 50x bound (best passive year multiple x1.25).
Before the rivals merge (synthetic rivals only) the same run gave passive 434-439M and greedy 157-303M.

## Maintenance suspended (lane/nomaint)
With `MAINTENANCE_ENABLED = false` the per-hour maintenance cost and all A-D downtime are gone. `pnpm --filter @arg/sim bots` (12 games x 10 years, default seeds): bankruptcies 8/12, exploits 0, crashes 0; passive 335 / 616M, greedy 274 / 285M, random, yolo, fareProbe and orderChurn still all bankrupt. Best year x1.34, best route margin 60%, nowhere near the 50x bound. No parameter was recalibrated; the one margin test that is tuned with maintenance in it (`economics.test.ts`) runs with the switch on. Re-run bots and soak when re-enabling.

## Exploits found and fixed
1. **Premium fares were free money.** Cabin passengers were allocated by seats and fill weight only, and demand reacted to the Y fare alone, so `fares.J = 400 x Y` multiplied cabin revenue. `fareProbe` reached USD 5-7.5B
   (up to x10.9 in one year, 87% route margins; flagged as exploit at 50x). Worse, once Y seats filled, overflow passengers were dumped into the highly priced J cabin. Fix: a cabin priced above its going multiple
   fills with weight `(m0/m)^2` and is capped at that fraction of its seats (`CabinInput.fillScale`, `allocateCabins`); revenue peaks near the going fare (test in `economics.test.ts`). After the fix `fareProbe` goes bankrupt in all three seeds.
2. Aircraft ordering and route churn (`orderChurn`): no profit possible. The deposit is credited back on delivery and ownership cost does not depend on the order discount, so ordering is cash-neutral until delivery and a lease
   cost afterwards; opening and closing routes is free but earns nothing. Not an exploit, but note there is no cancel/sell command and the discount (8-40%) currently has no economic effect, because the lease-equivalent is charged on list price.

## Known remaining issues
- Aircraft discount is cosmetic (see above): a real purchase/lease price model is needed before the order book matters.
- Rivals now react to undercutting (RIVALS.md); the passive airline's fixed fares are exposed to that, which is intended.
- No bankruptcy rule in the sim itself (the bots define it); negative cash simply continues.
- Greedy and passive are both stable but the market has no saturation signal for the player's own slot or airport capacity (`slotsPerHour` is unused).
- SAN-SFO metro volume is about 15.8k against a 8-14k target (structural, see MODEL.md section 1). Pandemic 2020-21 is not modelled; passive margins do not dip in 2020.
- stepDay costs about 1.5 ms (4 routes) to 8 ms (20+ routes) per day, up from 0.9 ms, because of rival sizing probes and hub markets (capped at 12 a day).
