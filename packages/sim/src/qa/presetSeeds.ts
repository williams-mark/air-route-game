// Product policy across seeds: two-year profit with an 85% target load factor, standard vs low-cost vs full service.
// Usage: vite-node src/qa/presetSeeds.ts [--seeds 1,2,3] [--days 730] [--target 0.85]
import { aircraftTypes, airports } from "@arg/data";
import type { AircraftType, Airport } from "@arg/contracts";
import { startingScenario } from "../scenario";
import { applyCommand, stepDay } from "../index";
import { DEFAULT_POLICY, PRESETS } from "../policy/product";

const argv = process.argv.slice(2);
const flag = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1]! : d; };
const seeds = flag("seeds", "1,2,3").split(",").map(Number);
const days = Number(flag("days", "730"));
const target = Number(flag("target", "0.85"));
const totals: Record<string, number[]> = {};
for (const seed of seeds) {
  for (const [name, pol] of [["standard", DEFAULT_POLICY], ["lowcost", PRESETS.lowcost], ["full", PRESETS.full]] as const) {
    let s = startingScenario(airports as Airport[], aircraftTypes as AircraftType[], seed, { rivalField: "world", presentYear: 2026, campaignYears: null });
    s = applyCommand(s, { kind: "setProductPolicy", policy: structuredClone(pol) }).state;
    if (target > 0) s = applyCommand(s, { kind: "setFarePolicy", policy: { id: "fp", name: "all", targetLoadFactor: target, connectionMarkdown: 0, scope: "all" } }).state;
    let prof = 0;
    for (let d = 0; d < days; d++) { s = stepDay(s); prof += s.snapshots[s.snapshots.length - 1]!.profit; }
    (totals[name] ??= []).push(prof / 1e6);
    console.log(`seed ${seed} ${name.padEnd(9)} profit ${(prof / 1e6).toFixed(1)}M  reputation ${Math.round((s.product?.reputation ?? 0) * 100)}`);
  }
}
for (const [k, v] of Object.entries(totals)) console.log(`${k.padEnd(9)} mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}M  (${v.map((x) => x.toFixed(0)).join(", ")})`);
