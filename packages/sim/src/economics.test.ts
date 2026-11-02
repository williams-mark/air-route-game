import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Aircraft } from "@arg/contracts";
import { benchmarkFare, defaultLayout, distanceKm, simulateRouteWeek, startingFare } from "./index";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const MILE = 1.609344;

/** CASM / RASM sanity table: one row per representative route, ownership charged fractionally, averaged over four seasons. */
function row(o: string, d: string, freq: number, typeId: string, fareScale = 1) {
  const a = A.get(o)!, b = A.get(d)!, t = T.get(typeId)!;
  const dist = distanceKm(a, b);
  const y = Math.round(startingFare(a, b) * fareScale);
  const ac: Aircraft = { id: "x", typeId, tailNumber: "x", layout: defaultLayout(t), status: "active", ageDays: 1000, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 } };
  let rev = 0, cost = 0, asm = 0, pax = 0, seats = 0;
  const lines: Record<string, number> = {};
  for (const day of [30, 120, 210, 300]) {
    const w = simulateRouteWeek(
      { id: "r", origin: o, destination: d, weeklyFrequency: freq, fares: t.widebody ? { Y: y, J: Math.round(y * 3.2) } : { Y: y }, typeId },
      A, T, day, { fleetAircraft: [ac], chargeOwnership: true },
    )!;
    const e = w.evaluation;
    rev += e.revenue; cost += e.costs; asm += (e.seatsPerWeek * dist) / MILE; pax += e.passengersPerWeek; seats += e.seatsPerWeek;
    for (const l of e.lines) if (l.group === "cost") lines[l.key] = (lines[l.key] ?? 0) + l.weekly;
  }
  const c = (k: string) => ((lines[k] ?? 0) / asm) * 100;
  return { name: `${o}-${d}`, type: typeId, miles: Math.round(dist / MILE), freq, fare: y, lf: pax / seats, casm: (cost / asm) * 100, rasm: (rev / asm) * 100, margin: (rev - cost) / rev, c };
}

describe("route economics sanity (CASM / RASM, ownership charged fractionally)", () => {
  const rows = [
    row("LAX", "SFO", 42, "B737-800"),
    row("SMF", "LAX", 14, "A320"),
    row("SAN", "SFO", 10, "B737-800"),
    row("LAX", "SAN", 14, "A320"),
    row("LAX", "HNL", 14, "B777-200ER"),
    row("LAX", "OGG", 7, "B757-200"),
    row("HNL", "OGG", 56, "A319"),
  ];
  it("prints the table and keeps margins and unit costs plausible", () => {
    for (const r of rows) {
      console.log(
        `ECON ${r.name.padEnd(8)} ${r.type.padEnd(10)} ${String(r.miles).padStart(4)}mi ${String(r.freq).padStart(2)}/wk fare ${String(r.fare).padStart(3)} LF ${(100 * r.lf).toFixed(0)}% ` +
        `CASM ${r.casm.toFixed(1)} RASM ${r.rasm.toFixed(1)} margin ${(100 * r.margin).toFixed(0)}% | ` +
        ["fuel", "crew", "airport", "handling", "paxServices", "maintenance", "ownership", "distribution", "overhead"].map((k) => `${k} ${r.c(k).toFixed(2)}`).join(" "),
      );
    }
    for (const r of rows) {
      // route margins after allocated ownership and overhead: nobody makes 40%+; nothing is hopeless at the starting fares
      expect(r.margin, r.name).toBeLessThan(0.25);
      expect(r.margin, r.name).toBeGreaterThan(-0.15);
    }
    const sfo = rows[0]!;
    expect(sfo.casm).toBeGreaterThan(15); // short sector (335 mi): high unit cost
    expect(sfo.casm).toBeLessThan(26);
    const hnl = rows[4]!;
    expect(hnl.casm).toBeGreaterThan(6.5); // transpacific widebody
    expect(hnl.casm).toBeLessThan(11.5);
    expect(hnl.rasm).toBeGreaterThan(8);
    // unit cost falls with stage length
    expect(sfo.casm).toBeGreaterThan(hnl.casm * 1.8);
  });
  it("benchmark fare is still the yield curve the starting scenario prices against", () => {
    expect(startingFare(A.get("LAX")!, A.get("SFO")!)).toBe(Math.round(benchmarkFare(distanceKm(A.get("LAX")!, A.get("SFO")!))));
    expect(startingFare(A.get("LAX")!, A.get("SAN")!)).toBeLessThan(benchmarkFare(distanceKm(A.get("LAX")!, A.get("SAN")!)));
  });
});

describe("premium fare exploit", () => {
  it("absurd premium-cabin fares do not beat sensible ones (revenue peaks near the going multiple)", () => {
    const run = (m: number) => {
      const t = T.get("B757-200")!;
      const ac: Aircraft = { id: "x", typeId: t.id, tailNumber: "x", layout: defaultLayout(t), status: "active", ageDays: 1, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 } };
      return simulateRouteWeek({ id: "r", origin: "LAX", destination: "OGG", weeklyFrequency: 7, fares: { Y: 266, J: 266 * m }, typeId: t.id }, A, T, 100, { fleetAircraft: [ac], chargeOwnership: false })!.evaluation.revenue;
    };
    const sensible = Math.max(run(1.5), run(2), run(3.2));
    for (const m of [10, 50, 400, 5000]) expect(run(m), `J x${m}`).toBeLessThan(sensible * 1.02);
  });
});
