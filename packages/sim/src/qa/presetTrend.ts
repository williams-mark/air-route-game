// Product policy over two years with an 85% target load factor: quarterly profit, fares and passengers, standard vs low-cost vs full.
// Usage: vite-node src/qa/presetTrend.ts
import { aircraftTypes, airports } from "@arg/data";
import type { AircraftType, Airport } from "@arg/contracts";
import { startingScenario } from "../scenario";
import { applyCommand, stepDay } from "../index";
import { DEFAULT_POLICY, PRESETS } from "../policy/product";

for (const [name, pol] of [["standard", DEFAULT_POLICY], ["lowcost", PRESETS.lowcost], ["full", PRESETS.full]] as const) {
  let s = startingScenario(airports as Airport[], aircraftTypes as AircraftType[], 2015, { rivalField: "world", presentYear: 2026, campaignYears: null });
  s = applyCommand(s, { kind: "setProductPolicy", policy: structuredClone(pol) }).state;
  s = applyCommand(s, { kind: "setFarePolicy", policy: { id: "fp", name: "all", targetLoadFactor: 0.85, connectionMarkdown: 0, scope: "all" } }).state;
  const rows: string[] = [];
  let prof = 0;
  for (let d = 1; d <= 730; d++) {
    s = stepDay(s); prof += s.snapshots[s.snapshots.length - 1]!.profit;
    if (d % 91 === 0) {
      const fares = s.world.routes.map((r) => `${r.destination}:${Math.round(r.fares.Y)}`).join(" ");
      const loc = Object.values(s.routeReports).reduce((t, r) => t + r.evaluation.passengersPerWeek, 0);
      const conn = Object.values(s.routeReports).reduce((t, r) => t + (r.connecting?.passengersOneWay ?? 0) * 2, 0);
      rows.push(`  q${d / 91} profit ${(prof / 1e6).toFixed(1)}M  pax ${Math.round(loc)} (conn ${Math.round(conn)})  rep ${Math.round((s.product?.reputation ?? 0) * 100)}  fares ${fares}`);
      prof = 0;
    }
  }
  console.log(name); for (const r of rows) console.log(r);
}
