import type { AircraftType, Airport, CabinClass, Day } from "@arg/contracts";
import { distanceKm } from "../geo";
import { jetAPriceUsdPerGallon, KG_PER_GALLON } from "./fuel";

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
}

const P = LEDGER_PARAMS;

export function blockHours(distKm: number, aircraft: AircraftType): number {
  const flown = distKm * P.routeExtension;
  return flown / (aircraft.cruiseKmh * P.airborneSpeedFactor) + P.groundBlockHours;
}

export function isRangeFeasible(distKm: number, aircraft: AircraftType): boolean {
  return distKm * P.routeExtension + P.reserveKm <= aircraft.rangeKm;
}

/** Allocate passengers across cabins proportionally to seats x fill weight, capping at seats. */
export function allocateCabins(cabins: CabinInput[], pax: number): number[] {
  const out = cabins.map(() => 0);
  let left = Math.min(pax, cabins.reduce((s, c) => s + c.seats, 0));
  const active = new Set(cabins.map((_, i) => i).filter((i) => cabins[i]!.seats > 0));
  for (let guard = 0; guard < 8 && left > 1e-9 && active.size > 0; guard++) {
    const wsum = [...active].reduce((s, i) => s + cabins[i]!.seats * P.cabinFillWeight[cabins[i]!.cls], 0);
    let given = 0;
    for (const i of [...active]) {
      const c = cabins[i]!;
      const want = (left * c.seats * P.cabinFillWeight[c.cls]) / wsum;
      const room = c.seats - out[i]!;
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
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

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
    if (ap.runwayM < aircraft.runwayNeededM) {
      reasons.push(`runway: ${ap.id} has ${ap.runwayM} m, ${aircraft.id} needs ${aircraft.runwayNeededM} m`);
    }
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
  const fuelGal = jetAPriceUsdPerGallon(inp.day, origin.region);
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
  const fas = Math.max(2, Math.ceil(seatsPerFlight / P.seatsPerFlightAttendant));
  const crewPerFlight = (pilots * P.pilotUsdPerHour + fas * P.faUsdPerHour) * bh;
  add("cost", "crew", "Flight and cabin crew", flights * crewPerFlight,
    `${r2(flights)} flights x ${r2(bh)} block h x (${pilots} pilots x ${usd(P.pilotUsdPerHour)} + ${fas} FAs x ${usd(P.faUsdPerHour)})`);

  const landing = P.landingFeeBaseUsd + P.landingFeePerSeatUsd * seatsPerFlight;
  add("cost", "airport", "Landing and airport fees", flights * landing,
    `${r2(flights)} landings x (${usd(P.landingFeeBaseUsd)} + ${P.landingFeePerSeatUsd}/seat x ${seatsPerFlight})`);

  add("cost", "handling", "Ground handling", flights * P.groundHandlingUsd[kind],
    `${r2(flights)} turnarounds x ${usd(P.groundHandlingUsd[kind])} (${kind}body)`);

  add("cost", "paxServices", "Passenger services", pax * P.passengerServicesUsdPerPax,
    `${r2(pax)} pax x ${usd(P.passengerServicesUsdPerPax)} (catering, check-in, claims)`);

  const maintPerHour = P.maintenanceUsdPerSeatHour[kind] * seatsPerFlight;
  add("cost", "maintenance", "Maintenance", flights * bh * maintPerHour,
    `${r2(flights * bh)} block h x ${usd(maintPerHour)}/h (${P.maintenanceUsdPerSeatHour[kind]}/seat-h x ${seatsPerFlight})`);

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
  };
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
