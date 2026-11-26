// How competitors' values grow: top five by value each year for 4 years (world field, medium, LAX, seed 2015), with the parts.
// Usage: vite-node src/qa/rivalValues.ts
import { aircraftTypes, airports } from "@arg/data";
import type { AircraftType, Airport } from "@arg/contracts";
import { startingScenario } from "../scenario";
import { runDays } from "../index";
import { playerValuation, rivalValuation } from "../market/market";

let s = startingScenario(airports as Airport[], aircraftTypes as AircraftType[], 2015, { rivalField: "world", presentYear: 2026, campaignYears: null });
const types = new Map(s.aircraftTypes.map((t) => [t.id, t]));
for (let y = 0; y <= 4; y++) {
  if (y > 0) s = runDays(s, 365);
  const vals = s.rivals!.airlines.filter((a) => a.status === "active").map((a) => ({ a, v: rivalValuation(a, types) })).sort((x, z) => z.v.valueUsd - x.v.valueUsd);
  const p = playerValuation(s);
  const med = vals[Math.floor(vals.length / 2)]!.v.valueUsd;
  console.log(`year ${y}: player ${(p.valueUsd / 1e6).toFixed(0)}M (cash ${(p.cashUsd / 1e6).toFixed(0)}, earn ${(p.earningsUsd / 1e6).toFixed(0)}), median rival ${(med / 1e6).toFixed(0)}M, rank ${1 + vals.filter((x) => x.v.valueUsd > p.valueUsd).length}/${vals.length + 1}`);
  for (const { a, v } of vals.slice(0, 4)) console.log(`   ${a.name.padEnd(18)} ${a.archetype.padEnd(8)} value ${(v.valueUsd / 1e6).toFixed(0)}M  cash ${(v.cashUsd / 1e6).toFixed(0)}M  fleet ${(v.fleetUsd / 1e6).toFixed(0)}M (${a.fleet.length} ac)  earnings ${(v.earningsUsd / 1e6).toFixed(0)}M/yr  routes ${a.routes.length}`);
}
