// Builds the evaluator's Facts from what the bridge already exposes (snapshot and read-only sim state). Reads only; changes nothing.
import type { Airport } from "@arg/contracts";
import { dayToDate, distanceKm, jan1Day, ownedHubsOf, type SimState } from "@arg/sim";
import type { SimSnapshot } from "../sim/bridge";
import type { Facts } from "./evaluate";

const airportIndex = new WeakMap<Airport[], Map<string, Airport>>();
function airportById(sim: SimState): Map<string, Airport> {
  let m = airportIndex.get(sim.airports);
  if (!m) { m = new Map(sim.airports.map((a) => [a.id, a])); airportIndex.set(sim.airports, m); }
  return m;
}

/** Profit and recorded days of the calendar year before the current one, from the daily ledger (scans at most about two years from the end). */
export function lastYearProfit(ledger: SimSnapshot["ledger"], day: number): Facts["lastYearProfit"] {
  const year = dayToDate(day).year;
  const from = jan1Day(year - 1);
  const to = jan1Day(year);
  let profitUsd = 0;
  let days = 0;
  for (let i = ledger.length - 1; i >= 0; i--) {
    const r = ledger[i]!;
    if (r.day >= to) continue;
    if (r.day < from) break;
    profitUsd += r.profit;
    days++;
  }
  return days > 0 ? { profitUsd, days } : null;
}

export function factsFrom(snap: SimSnapshot, sim: SimState): Facts {
  const airports = airportById(sim);
  let longestRouteKm = 0;
  for (const r of snap.routes) {
    const a = airports.get(r.origin);
    const b = airports.get(r.destination);
    if (a && b) longestRouteKm = Math.max(longestRouteKm, distanceKm(a, b));
  }
  return {
    gameKey: `${sim.world.seed}|${sim.airlineName}|${sim.campaign?.startDay ?? ""}`,
    day: snap.day,
    campaignStartDay: sim.campaign?.startDay ?? null,
    pandemicOn: sim.params.pandemic !== false,
    bankrupt: snap.credit?.bankrupt != null,
    inDistress: snap.credit?.distress != null,
    fleetCount: snap.fleet.reduce((n, a) => (a.status === "delivery" ? n : n + 1), 0),
    routeIds: snap.routes.map((r) => r.id),
    longestRouteKm,
    hubCount: ownedHubsOf(sim).length,
    reviewGrade: snap.review?.score.grade ?? null,
    lastYearProfit: lastYearProfit(snap.ledger, snap.day),
  };
}
