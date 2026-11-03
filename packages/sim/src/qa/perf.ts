import { aircraftTypes, airports } from "@arg/data";
import { startingScenario } from "../scenario";
import { drainEvents, stepDay } from "../index";
import { rivalIndustry } from "../rivals/reports";

/** Usage: pnpm --filter @arg/sim perf [--years 10] [--seed 2015]. Headless passive run with rivals; prints wall time and ms per sim day. */
function arg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
}
const years = arg("years", 10), seed = arg("seed", 2015);
const t0 = performance.now();
let s = startingScenario(airports, aircraftTypes, seed);
const tSetup = performance.now() - t0;
const days = Math.round(years * 365);
for (let d = 0; d < days; d++) {
  s = stepDay(s);
  if (d % 90 === 0) s = drainEvents(s).state;
}
const total = (performance.now() - t0) / 1000;
console.log(`PERF airports=${airports.length} setup=${tSetup.toFixed(0)}ms ${years}y=${total.toFixed(2)}s (${((total * 1000) / days).toFixed(2)} ms/day)`, JSON.stringify(rivalIndustry(s)));
