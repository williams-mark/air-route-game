import { aircraftTypes, airports } from "@arg/data";
import { startingScenario } from "../scenario";
import { drainEvents, stepDay } from "../index";
import { weeklyFixed } from "../rivals/engine";

/** Usage: pnpm --filter @arg/sim rivals [--years 10] [--seed 2015]. Passive run; prints each rival's year-end cash, routes, fleet and profit. */
function arg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
}
const years = arg("years", 10), seed = arg("seed", 2015);
let s = startingScenario(airports, aircraftTypes, seed);
const pad = (x: string | number, n: number) => String(x).padStart(n);
for (let y = 0; y < years; y++) {
  for (let d = 0; d < 365; d++) { s = stepDay(s); if (d % 90 === 0) s = drainEvents(s).state; }
  console.log(`--- end of ${2015 + y}`);
  for (const a of s.rivals!.airlines) {
    const p52 = a.profit52.reduce((x, z) => x + z, 0);
    const rev = a.routes.reduce((x, r) => x + r.revenue, 0) * 52;
    const lf = a.routes.length ? a.routes.reduce((x, r) => x + r.loadFactor * r.revenue, 0) / Math.max(1, a.routes.reduce((x, r) => x + r.revenue, 0)) : 0;
    console.log(`${a.name.padEnd(22)} ${a.status.padEnd(8)} cash ${pad((a.cash / 1e6).toFixed(0), 5)}M (init ${pad((a.initialCash / 1e6).toFixed(0), 4)}M) routes ${pad(a.routes.length, 3)} fleet ${pad(a.fleet.length, 4)} 52w profit ${pad((p52 / 1e6).toFixed(1), 6)}M rev ${pad((rev / 1e6).toFixed(0), 5)}M margin ${pad(rev > 0 ? ((p52 / rev) * 100).toFixed(1) : "-", 5)}% LF ${(lf * 100).toFixed(0)}% fixed/wk ${(weeklyFixed(a, { types: new Map(s.aircraftTypes.map((t) => [t.id, t])) } as never) / 1e3).toFixed(0)}k`);
  }
}
console.log("bankruptcies:", s.bankruptcies.map((b) => `${b.airlineName}@${b.day}`).join(", ") || "none");
