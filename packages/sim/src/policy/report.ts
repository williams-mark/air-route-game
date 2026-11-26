// What the Policies panel shows per distance band: the player's routes and passengers, what the policy costs and earns, and how the
// player's product compares with the competitors flying the same markets. Read-only.
import type { Id } from "@arg/contracts";
import type { SimState } from "../state";
import type { Archetype } from "../rivals/types";
import { competitorItinerariesFor } from "../rivals";
import { BANDS, bandOf, productEffect, productOf, type Band, type ProductPolicy } from "./product";

export interface BandReport {
  band: Band;
  routes: number;
  /** Passengers per week, both directions (latest reports). */
  paxPerWeek: number;
  servicesUsdPerPax: number;
  ancillaryUsdPerPax: number;
  /** Weekly service cost and ancillary revenue at today's passengers, USD. */
  serviceCostWeekly: number;
  ancillaryWeekly: number;
  /** Product score 0..100 (choice-model quality x 100, before saturation): the player's, and the seat-weighted competitors' in these markets. */
  playerScore: number;
  rivalScore: number | null;
  /** Competitor seats in these markets by airline type (shares 0..1); empty when nobody competes. */
  rivalMix: Partial<Record<Archetype, number>>;
  pointsVsExpected: number;
  feesVsDefault: number;
  perceivedFareUsd: number;
}

/** Per-band report for `policy` (default: the current one) at the player's current traffic. */
export function productReport(state: SimState, policy?: ProductPolicy): BandReport[] {
  const prod = productOf(state);
  const pol = policy ?? prod.policy;
  const airports = new Map(state.airports.map((a) => [a.id, a]));
  const types = new Map(state.aircraftTypes.map((t) => [t.id, t]));
  const archetypeOf = new Map<Id, Archetype>((state.rivals?.airlines ?? []).map((a) => [a.id, a.archetype]));
  const acc = new Map<Band, { routes: number; pax: number; rq: number; rw: number; mix: Partial<Record<Archetype, number>> }>();
  for (const b of BANDS) acc.set(b, { routes: 0, pax: 0, rq: 0, rw: 0, mix: {} });
  for (const r of state.world.routes) {
    const rep = state.routeReports[r.id];
    const a = airports.get(r.origin), b = airports.get(r.destination);
    if (!rep || !a || !b) continue;
    const x = acc.get(bandOf(rep.evaluation.distanceKm))!;
    x.routes += 1;
    x.pax += rep.evaluation.passengersPerWeek;
    for (const it of competitorItinerariesFor(state.rivals, a, b, types, airports) ?? []) {
      const seats = Math.min(...it.legs.map((l) => l.weeklySeats));
      if (!(seats > 0)) continue;
      x.rq += it.quality * seats; x.rw += seats;
      const arch = archetypeOf.get(it.carrier);
      if (arch) x.mix[arch] = (x.mix[arch] ?? 0) + seats;
    }
  }
  return BANDS.map((band) => {
    const x = acc.get(band)!;
    const e = productEffect(pol, band, prod.reputation);
    const mixTotal = Object.values(x.mix).reduce((s, v) => s + (v ?? 0), 0);
    return {
      band, routes: x.routes, paxPerWeek: x.pax,
      servicesUsdPerPax: e.servicesUsdPerPax, ancillaryUsdPerPax: e.ancillaryUsdPerPax,
      serviceCostWeekly: e.servicesUsdPerPax * x.pax, ancillaryWeekly: e.ancillaryUsdPerPax * x.pax,
      playerScore: Math.round((0.5 + e.qualityDelta) * 100),
      rivalScore: x.rw > 0 ? Math.round((x.rq / x.rw) * 100) : null,
      rivalMix: mixTotal > 0 ? Object.fromEntries(Object.entries(x.mix).map(([k, v]) => [k, (v ?? 0) / mixTotal])) : {},
      pointsVsExpected: e.pointsVsExpected, feesVsDefault: e.feesVsDefault, perceivedFareUsd: e.perceivedFareUsd,
    };
  });
}
