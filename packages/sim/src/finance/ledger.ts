import type { AircraftType, Airport, CabinClass, Day } from "@arg/contracts";
import { canFlyOverwater, isOverwaterRoute } from "@arg/data";
import { distanceKm, simRunwayM } from "../geo";
import { maintenanceEnabled } from "../fleet/maintenance";
import { obsolescenceMultiplier } from "../fleet/lifecycle";
import { jetAPriceUsdPerGallon, KG_PER_GALLON } from "./fuel";
import { costFactors } from "../world/regions";

// ---------------------------------------------------------------------------
// Constants (documented in MODEL.md section 3)
// ---------------------------------------------------------------------------
export const LEDGER_PARAMS = {
  routeExtension: 1.04, // flown distance / great circle
  airborneSpeedFactor: 0.93, // average block speed while airborne vs cruise speed
  groundBlockHours: 0.65, // taxi, climb and approach allowance per flight
  reserveKm: 370, // range reserve (alternate + holding)
  fuelLoadSensitivity: 0.16, // burn = base x (1 - s/2 + s x LF)
  taxiFuelKg: { narrow: 450, wide: 900 },
  pilotUsdPerHour: 340,
  faUsdPerHour: 85,
  seatsPerFlightAttendant: 40,
  landingFeeBaseUsd: 800,
  landingFeePerSeatUsd: 7.5,
  groundHandlingUsd: { narrow: 700, wide: 1400 },
  passengerServicesUsdPerPax: 13,
  maintenanceUsdPerSeatHour: { narrow: 3.5, wide: 4.5 },
  streetPriceOfList: 0.55,
  leaseRatePerMonth: 0.0075,
  utilizationBlockHoursPerDay: { narrow: 11, wide: 13 },
  ancillaryUsdPerPax: 14,
  distributionShareOfRevenue: 0.06,
  generalOverheadShareOfRevenue: 0.06,
  routeFixedOverheadUsdPerWeek: 5000,
  cabinFillWeight: { F: 0.75, J: 0.8, W: 0.88, Y: 1 } as Record<CabinClass, number>,
} as const;

export interface CabinInput {
  cls: CabinClass;
  seats: number;
  /** One-way fare in USD. */
  fare: number;
  /** Multiplier on the cabin's fill weight (default 1); premium cabins priced above the going multiple fill less. */
  fillScale?: number;
  /** Cabin-lane hook (default 1): demand-driven multiplier on the cabin's fill weight only, no capacity cap (see cabin/effects.ts). */
  fillRatio?: number;
}

export interface RouteInputs {
  origin: Airport;
  destination: Airport;
  aircraft: AircraftType;
  day: Day;
  /** Departures per week in each direction. */
  weeklyFrequency: number;
  cabins: CabinInput[];
  /** Passengers per week on the route, both directions combined. Capped by seats. */
  weeklyPassengers: number;
  /**
   * "fractional": charge the share of an aircraft's lease that this route's block hours use.
   * "excluded": ownership is charged elsewhere (the player's actual fleet).
   */
  ownership?: "fractional" | "excluded";
  /** Multiplier on frequency actually flown (0..1), e.g. when the fleet is too small. */
  operatedFraction?: number;
  /** Cabin-lane hook, omitted = no change: multiplier on passenger-services cost and seat count used for crew sizing. */
  cabinCost?: { paxServices?: number; crewSeats?: number };
}

export interface LedgerLine {
  key: string;
  label: string;
  group: "revenue" | "cost";
  /** USD per week for the whole route (positive numbers; revenue and cost kept separate). */
  weekly: number;
  /** Human-readable derivation for the "why" ledger. */
  formula: string;
}

/** Seats and passengers of one cabin on a route, per week (both directions). */
export interface CabinLoad {
  cls: CabinClass;
  seatsPerWeek: number;
  passengersPerWeek: number;
}

export interface RouteEvaluation {
  feasible: boolean;
  infeasibleReasons: string[];
  distanceKm: number;
  blockHours: number;
  /** Total one-way departures per week (both directions). */
  flightsPerWeek: number;
  seatsPerFlight: number;
  seatsPerWeek: number;
  passengersPerWeek: number;
  loadFactor: number;
  fuelUsdPerGallon: number;
  aircraftEquivalent: number;
  aircraftNeeded: number;
  lines: LedgerLine[];
  revenue: number;
  costs: number;
  profit: number;
  /** profit / revenue, or -1 when there is no revenue but there are costs. */
  margin: number;
  revenuePerPassenger: number;
  costPerPassenger: number;
  /** Approximate break-even load factor assuming revenue scales linearly with load. */
  breakEvenLoadFactor: number | null;
  /** Seats and passengers per cabin the route flies (absent in older saves; computed by evaluateRoute). */
  cabinLoads?: CabinLoad[];
}

const P = LEDGER_PARAMS;

export function blockHours(distKm: number, aircraft: AircraftType): number {
  const flown = distKm * P.routeExtension;
  return flown / (aircraft.cruiseKmh * P.airborneSpeedFactor) + P.groundBlockHours;
}

export function isRangeFeasible(distKm: number, aircraft: AircraftType): boolean {
  return distKm * P.routeExtension + P.reserveKm <= aircraft.rangeKm;
}

/** Longest great-circle sector the sim accepts for a type: nominal range less the fuel reserve, divided by the routing extension. */
export function maxRouteKm(aircraft: AircraftType): number {
  return Math.max(0, (aircraft.rangeKm - P.reserveKm) / P.routeExtension);
}

/** Allocate passengers across cabins proportionally to seats x fill weight, capping at seats. */
export function allocateCabins(cabins: CabinInput[], pax: number): number[] {
  const out = cabins.map(() => 0);
  // A cabin priced far above the going multiple (fillScale < 1) can only ever sell that fraction of its seats, so overflow
  // demand cannot be dumped into a ridiculously priced premium cabin.
  const cap = (i: number) => cabins[i]!.seats * Math.min(1, cabins[i]!.fillScale ?? 1);
  let left = Math.min(pax, cabins.reduce((s, _c, i) => s + cap(i), 0));
  const active = new Set(cabins.map((_, i) => i).filter((i) => cabins[i]!.seats > 0));
  for (let guard = 0; guard < 8 && left > 1e-9 && active.size > 0; guard++) {
    const w = (i: number) => P.cabinFillWeight[cabins[i]!.cls] * (cabins[i]!.fillScale ?? 1) * (cabins[i]!.fillRatio ?? 1);
    const wsum = [...active].reduce((s, i) => s + cabins[i]!.seats * w(i), 0);
    let given = 0;
    for (const i of [...active]) {
      const c = cabins[i]!;
      const want = (left * c.seats * w(i)) / wsum;
      const room = cap(i) - out[i]!;
      const g = Math.min(want, room);
      out[i]! += g;
      given += g;
      if (room - g <= 1e-9) active.delete(i);
    }
    left -= given;
  }
  return out;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const usd = (x: number) => {
  const n = Math.round(x);
  const neg = n < 0;
  let t = String(neg ? -n : n);
  for (let i = t.length - 3; i > 0; i -= 3) t = `${t.slice(0, i)},${t.slice(i)}`;
  return `$${neg ? "-" : ""}${t}`;
};

export function evaluateRoute(inp: RouteInputs): RouteEvaluation {
  const { origin, destination, aircraft } = inp;
  const dist = distanceKm(origin, destination);
  const kind = aircraft.widebody ? "wide" : "narrow";
  const seatsPerFlight = inp.cabins.reduce((s, c) => s + c.seats, 0);
  const reasons: string[] = [];
  if (!isRangeFeasible(dist, aircraft)) {
    reasons.push(
      `range: needs ${Math.round(dist * P.routeExtension + P.reserveKm)} km incl. reserve, ${aircraft.id} has ${aircraft.rangeKm} km`,
    );
  }
  for (const ap of [origin, destination]) {
    const need = simRunwayM(aircraft, dist);
    if (ap.runwayM < need) {
      reasons.push(`runway: ${ap.id} has ${ap.runwayM} m, ${aircraft.id} needs ${Math.round(need)} m`);
    }
  }
  if (isOverwaterRoute(origin, destination) && !canFlyOverwater(aircraft, origin, destination, dist)) {
    reasons.push(`overwater: ${aircraft.id} may not fly ${Math.round(dist)} km over water here (twin-engine diversion limit)`);
  }
  if (seatsPerFlight > aircraft.maxSeats) reasons.push(`seats: ${seatsPerFlight} exceeds max ${aircraft.maxSeats}`);
  if (seatsPerFlight <= 0) reasons.push("seats: no seats configured");
  if (inp.weeklyFrequency <= 0) reasons.push("frequency: no weekly departures");
  const feasible = reasons.length === 0;

  const bh = blockHours(dist, aircraft);
  const fraction = Math.max(0, Math.min(1, inp.operatedFraction ?? 1));
  const flights = feasible ? 2 * inp.weeklyFrequency * fraction : 0;
  const seatsWeek = flights * seatsPerFlight;
  const pax = feasible ? Math.min(Math.max(0, inp.weeklyPassengers), seatsWeek) : 0;
  const lf = seatsWeek > 0 ? pax / seatsWeek : 0;
  const fuelGal = jetAPriceUsdPerGallon(inp.day, origin);
  const fuelKg = fuelGal / KG_PER_GALLON;

  const lines: LedgerLine[] = [];
  const add = (group: "revenue" | "cost", key: string, label: string, weekly: number, formula: string) =>
    lines.push({ key, label, group, weekly, formula });

  // Revenue
  const cabinPax = allocateCabins(inp.cabins.map((c) => ({ ...c, seats: c.seats * flights })), pax);
  inp.cabins.forEach((c, i) => {
    const p = cabinPax[i]!;
    add("revenue", `fare_${c.cls}`, `Fares, ${c.cls} cabin`, p * c.fare,
      `${r2(p)} pax/wk x ${usd(c.fare)} (${c.seats} seats/flight, ${r2(flights)} flights)`);
  });
  const ancillary = pax * P.ancillaryUsdPerPax;
  add("revenue", "ancillary", "Ancillary (bags, seats, onboard)", ancillary, `${r2(pax)} pax x ${usd(P.ancillaryUsdPerPax)}`);
  const revenue = lines.reduce((s, l) => s + l.weekly, 0);

  // Variable operating costs
  const loadFactorBurn = 1 - P.fuelLoadSensitivity / 2 + P.fuelLoadSensitivity * lf;
  const fuelPerFlightKg =
    aircraft.fuelBurnKgPerKm * dist * P.routeExtension * loadFactorBurn + P.taxiFuelKg[kind];
  add("cost", "fuel", "Fuel", flights * fuelPerFlightKg * fuelKg,
    `${r2(flights)} flights x ${Math.round(fuelPerFlightKg)} kg (burn ${aircraft.fuelBurnKgPerKm} kg/km x ${Math.round(dist * P.routeExtension)} km x load adj ${r2(loadFactorBurn)} + taxi) x ${usd(fuelKg * 1000) } per tonne @ $${r2(fuelGal)}/gal`);

  const pilots = bh > 12 ? 4 : bh > 8 ? 3 : 2;
  const fas = Math.max(2, Math.ceil((inp.cabinCost?.crewSeats ?? seatsPerFlight) / P.seatsPerFlightAttendant));
  const cf = costFactors(origin, destination);
  const crewPerFlight = (pilots * P.pilotUsdPerHour + fas * P.faUsdPerHour) * bh * cf.labour;
  add("cost", "crew", "Flight and cabin crew", flights * crewPerFlight,
    `${r2(flights)} flights x ${r2(bh)} block h x (${pilots} pilots x ${usd(P.pilotUsdPerHour)} + ${fas} FAs x ${usd(P.faUsdPerHour)})${cf.labour !== 1 ? ` x ${r2(cf.labour)} regional pay level` : ""}`);

  const landing = (P.landingFeeBaseUsd + P.landingFeePerSeatUsd * seatsPerFlight) * cf.airport;
  add("cost", "airport", "Landing and airport fees", flights * landing,
    `${r2(flights)} landings x (${usd(P.landingFeeBaseUsd)} + ${P.landingFeePerSeatUsd}/seat x ${seatsPerFlight})${cf.airport !== 1 ? ` x ${r2(cf.airport)} regional charges` : ""}`);

  add("cost", "handling", "Ground handling", flights * P.groundHandlingUsd[kind] * cf.handling,
    `${r2(flights)} turnarounds x ${usd(P.groundHandlingUsd[kind])} (${kind}body)${cf.handling !== 1 ? ` x ${r2(cf.handling)} regional handling` : ""}`);

  add("cost", "paxServices", "Passenger services", pax * P.passengerServicesUsdPerPax * (inp.cabinCost?.paxServices ?? 1),
    `${r2(pax)} pax x ${usd(P.passengerServicesUsdPerPax)}${inp.cabinCost?.paxServices && inp.cabinCost.paxServices !== 1 ? ` x ${r2(inp.cabinCost.paxServices)} cabin mix` : ""} (catering, check-in, claims)`);

  const maintPerHour = P.maintenanceUsdPerSeatHour[kind] * seatsPerFlight * obsolescenceMultiplier(aircraft, inp.day);
  add("cost", "maintenance", "Maintenance", maintenanceEnabled() ? flights * bh * maintPerHour : 0,
    maintenanceEnabled()
      ? `${r2(flights * bh)} block h x ${usd(maintPerHour)}/h (${P.maintenanceUsdPerSeatHour[kind]}/seat-h x ${seatsPerFlight})`
      : "Maintenance is suspended in this version");

  // Ownership
  const util = P.utilizationBlockHoursPerDay[kind] * 7;
  const weeklyBlock = (feasible ? flights : 2 * Math.max(1, inp.weeklyFrequency)) * bh;
  const aircraftEq = weeklyBlock / util;
  const monthlyLease = aircraft.listPriceUsdM * 1e6 * P.streetPriceOfList * P.leaseRatePerMonth;
  const ownership = inp.ownership ?? "fractional";
  if (ownership === "fractional") {
    add("cost", "ownership", "Aircraft ownership / lease", aircraftEq * monthlyLease * (12 / 52),
      `${r2(aircraftEq)} aircraft (${r2(weeklyBlock)} block h/wk / ${util} h) x ${usd(monthlyLease)}/month x 12/52`);
  }

  // Overheads
  add("cost", "distribution", "Sales and distribution", revenue * P.distributionShareOfRevenue,
    `${P.distributionShareOfRevenue * 100}% of revenue`);
  add("cost", "overhead", "Route and general overhead", P.routeFixedOverheadUsdPerWeek + revenue * P.generalOverheadShareOfRevenue,
    `${usd(P.routeFixedOverheadUsdPerWeek)}/wk station + ${P.generalOverheadShareOfRevenue * 100}% of revenue`);

  const costs = lines.filter((l) => l.group === "cost").reduce((s, l) => s + l.weekly, 0);
  const profit = revenue - costs;
  return {
    feasible,
    infeasibleReasons: reasons,
    distanceKm: dist,
    blockHours: bh,
    flightsPerWeek: flights,
    seatsPerFlight,
    seatsPerWeek: seatsWeek,
    passengersPerWeek: pax,
    loadFactor: lf,
    fuelUsdPerGallon: fuelGal,
    aircraftEquivalent: aircraftEq,
    aircraftNeeded: Math.ceil(aircraftEq - 1e-9),
    lines,
    revenue,
    costs,
    profit,
    margin: revenue > 0 ? profit / revenue : costs > 0 ? -1 : 0,
    revenuePerPassenger: pax > 0 ? revenue / pax : 0,
    costPerPassenger: pax > 0 ? costs / pax : 0,
    breakEvenLoadFactor: revenue > 0 && lf > 0 ? Math.min(2, (costs / revenue) * lf) : null,
    cabinLoads: inp.cabins.map((c, i) => ({ cls: c.cls, seatsPerWeek: c.seats * flights, passengersPerWeek: cabinPax[i]! })),
  };
}

/**
 * Combine evaluations of the same route flown by several aircraft groups (each evaluated with its own type, layout and
 * share of the round trips). Money, flights, seats, passengers and aircraft-equivalents add up; the per-route station
 * overhead is charged once, not once per group.
 */
export function mergeEvaluations(parts: readonly RouteEvaluation[]): RouteEvaluation {
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const sum = (f: (e: RouteEvaluation) => number) => parts.reduce((s, e) => s + f(e), 0);
  const feasible = parts.every((e) => e.feasible);
  const flights = sum((e) => e.flightsPerWeek);
  const seatsWeek = sum((e) => e.seatsPerWeek);
  const pax = sum((e) => e.passengersPerWeek);
  const keys: string[] = [];
  for (const e of parts) for (const l of e.lines) if (!keys.includes(l.key)) keys.push(l.key);
  const lines: LedgerLine[] = keys.map((key) => {
    const ls = parts.map((e) => e.lines.find((l) => l.key === key)).filter((l): l is LedgerLine => !!l);
    let weekly = ls.reduce((s, l) => s + l.weekly, 0);
    if (key === "overhead") weekly -= (ls.length - 1) * P.routeFixedOverheadUsdPerWeek;
    const one = ls[0]!;
    return {
      key, label: one.label, group: one.group, weekly,
      formula: `mixed fleet, ${parts.length} aircraft variants: ${ls.map((l) => l.formula).join(" | ")}`,
    };
  });
  const revenue = lines.filter((l) => l.group === "revenue").reduce((s, l) => s + l.weekly, 0);
  const costs = lines.filter((l) => l.group === "cost").reduce((s, l) => s + l.weekly, 0);
  const lf = seatsWeek > 0 ? pax / seatsWeek : 0;
  const aircraftEq = sum((e) => e.aircraftEquivalent);
  return {
    ...first,
    feasible,
    infeasibleReasons: [...new Set(parts.flatMap((e) => e.infeasibleReasons))],
    blockHours: flights > 0 ? sum((e) => e.blockHours * e.flightsPerWeek) / flights : first.blockHours,
    flightsPerWeek: flights,
    seatsPerFlight: flights > 0 ? seatsWeek / flights : first.seatsPerFlight,
    seatsPerWeek: seatsWeek,
    passengersPerWeek: pax,
    loadFactor: lf,
    aircraftEquivalent: aircraftEq,
    aircraftNeeded: Math.ceil(aircraftEq - 1e-9),
    lines, revenue, costs,
    profit: revenue - costs,
    margin: revenue > 0 ? (revenue - costs) / revenue : costs > 0 ? -1 : 0,
    revenuePerPassenger: pax > 0 ? revenue / pax : 0,
    costPerPassenger: pax > 0 ? costs / pax : 0,
    breakEvenLoadFactor: revenue > 0 && lf > 0 ? Math.min(2, (costs / revenue) * lf) : null,
    cabinLoads: mergeCabinLoads(parts),
  };
}

/** Per-cabin seats and passengers summed over the parts; absent when any part lacks them. */
function mergeCabinLoads(parts: readonly RouteEvaluation[]): CabinLoad[] | undefined {
  if (!parts.every((e) => e.cabinLoads)) return undefined;
  const byCls = new Map<CabinClass, CabinLoad>();
  for (const e of parts) {
    for (const c of e.cabinLoads!) {
      const cur = byCls.get(c.cls) ?? { cls: c.cls, seatsPerWeek: 0, passengersPerWeek: 0 };
      cur.seatsPerWeek += c.seatsPerWeek;
      cur.passengersPerWeek += c.passengersPerWeek;
      byCls.set(c.cls, cur);
    }
  }
  return [...byCls.values()];
}

/** Aircraft (fractional) needed to fly `weeklyFrequency` round trips on a pair. */
export function aircraftEquivalentFor(distKm: number, aircraft: AircraftType, weeklyFrequency: number): number {
  const kind = aircraft.widebody ? "wide" : "narrow";
  return (2 * weeklyFrequency * blockHours(distKm, aircraft)) / (P.utilizationBlockHoursPerDay[kind] * 7);
}

/** Monthly lease-equivalent ownership cost of one aircraft of this type, USD. */
export function monthlyOwnershipUsd(aircraft: AircraftType): number {
  return aircraft.listPriceUsdM * 1e6 * P.streetPriceOfList * P.leaseRatePerMonth;
}
