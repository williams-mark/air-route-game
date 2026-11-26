// Ledger lines summed over routes after 120 days, standard vs low-cost: where does the revenue go? Debug aid.
import { aircraftTypes, airports } from "@arg/data";
import type { AircraftType, Airport } from "@arg/contracts";
import { startingScenario } from "../scenario";
import { applyCommand, runDays } from "../index";
import { DEFAULT_POLICY, PRESETS } from "../policy/product";

for (const [name, pol] of [["standard", DEFAULT_POLICY], ["lowcost", PRESETS.lowcost], ["full", PRESETS.full]] as const) {
  let s = startingScenario(airports as Airport[], aircraftTypes as AircraftType[], 2015, { rivalField: "world", presentYear: 2026, campaignYears: null });
  s = applyCommand(s, { kind: "setProductPolicy", policy: structuredClone(pol) }).state;
  s = runDays(s, 120);
  const sum: Record<string, number> = {};
  let pax = 0;
  for (const r of Object.values(s.routeReports)) { pax += r.evaluation.passengersPerWeek; for (const l of r.evaluation.lines) sum[l.key] = (sum[l.key] ?? 0) + (l.group === "revenue" ? 1 : -1) * l.weekly; }
  console.log(name, "pax", Math.round(pax));
  console.log("  ", Object.entries(sum).map(([k, v]) => `${k} ${(v / 1e3).toFixed(0)}k`).join("  "));
}
