// Product-policy balance probe: the same world-field game with each preset (and a few custom policies) for N days.
// Prints profit, revenue, passengers, average economy fare and reputation. Usage: vite-node src/qa/presets.ts [--days 365] [--seed 2015]
import { aircraftTypes, airports } from "@arg/data";
import type { AircraftType, Airport } from "@arg/contracts";
import { startingScenario } from "../scenario";
import { applyCommand, stepDay } from "../index";
import { DEFAULT_POLICY, PRESETS, type ProductPolicy } from "../policy/product";

const argv = process.argv.slice(2);
const flag = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1]! : d; };
const days = Number(flag("days", "365"));
const seed = Number(flag("seed", "2015"));
const hub = flag("hub", "LAX");
const target = flag("target", "");

const freeBags = structuredClone(DEFAULT_POLICY); for (const b of ["short", "medium", "long", "ultra"] as const) freeBags.ancillary[b].bagFee = 0;
const steepBags = structuredClone(DEFAULT_POLICY); for (const b of ["short", "medium", "long", "ultra"] as const) steepBags.ancillary[b].bagFee = 120;
const longPremium = structuredClone(DEFAULT_POLICY); longPremium.service.long = { meal: "premium", crew: "generous", amenities: "premium" };
const cases: [string, ProductPolicy | null][] = [["none", null], ["standard", DEFAULT_POLICY], ["lowcost", PRESETS.lowcost], ["full", PRESETS.full], ["freeBags", freeBags], ["steepBags", steepBags], ["longPremium", longPremium]];

for (const [name, pol] of cases) {
  let s = startingScenario(airports as Airport[], aircraftTypes as AircraftType[], seed, { rivalField: "world", hub, presentYear: 2026, campaignYears: null });
  if (pol) s = applyCommand(s, { kind: "setProductPolicy", policy: structuredClone(pol) }).state;
  if (target) s = applyCommand(s, { kind: "setFarePolicy", policy: { id: "fp", name: "all", targetLoadFactor: Number(target), connectionMarkdown: 0, scope: "all" } }).state;
  let rev = 0, prof = 0;
  for (let d = 0; d < days; d++) { s = stepDay(s); const x = s.snapshots[s.snapshots.length - 1]!; rev += x.revenue; prof += x.profit; }
  const reps = Object.values(s.routeReports);
  const pax = reps.reduce((t, r) => t + r.evaluation.passengersPerWeek, 0);
  const lf = reps.reduce((t, r) => t + r.evaluation.passengersPerWeek, 0) / Math.max(1, reps.reduce((t, r) => t + r.evaluation.seatsPerWeek, 0));
  const fare = s.world.routes.reduce((t, r) => t + r.fares.Y, 0) / Math.max(1, s.world.routes.length);
  console.log(`${name.padEnd(12)} profit ${(prof / 1e6).toFixed(1).padStart(7)}M  revenue ${(rev / 1e6).toFixed(0).padStart(5)}M  margin ${((100 * prof) / rev).toFixed(1).padStart(5)}%  pax/wk ${Math.round(pax)}  LF ${(lf * 100).toFixed(0)}%  avg Y fare ${fare.toFixed(0)}  reputation ${((s.product?.reputation ?? 0) * 100).toFixed(0)}`);
}
