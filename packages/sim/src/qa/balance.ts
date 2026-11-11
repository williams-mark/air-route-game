import { aircraftTypes, airports } from "@arg/data";
import { applyCommand } from "../commands";
import { makeRng, mixSeed } from "../rng";
import { startingScenario } from "../scenario";
import { stepDay } from "../index";
import type { SimState } from "../state";
import { greedy, passive, type Strategy } from "../bots/strategies";
import { dayToDate } from "../time/calendar";

/**
 * Balance harness: seeded multi-year games with the passive and greedy bots, printing per-calendar-year revenue,
 * operating margin (profit / revenue from the daily snapshots; includes overdraft interest) and a revenue-weighted
 * load factor. Deterministic: same args, same output.
 * Usage: pnpm --filter @arg/sim balance [--games 3] [--years 15] [--seed 1] [--bots passive,greedy]
 */
function arg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
}
const sarg = (name: string, dflt: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1]! : dflt; };

export interface YearRow { year: number; revenue: number; costs: number; margin: number; /** Margin after imputed straight-line depreciation of purchased aircraft (cash accounting books the price at delivery, not as a P&L cost). */ adjMargin: number; loadFactor: number }
export interface BalanceRun { strategy: string; seed: number; rows: YearRow[]; bankruptYear: number | null; finalCash: number }

export function playBalance(strategy: Strategy, seed: number, years: number): BalanceRun {
  const rng = makeRng(mixSeed(seed, 0xb07));
  let s: SimState = startingScenario(airports, aircraftTypes, seed);
  const days = Math.round(years * 365.25);
  const acc = new Map<number, { rev: number; cost: number; dep: number; seats: number; pax: number }>();
  const typeById = new Map(s.aircraftTypes.map((t) => [t.id, t]));
  let bankruptYear: number | null = null;
  for (let d = 0; d < days; d++) {
    if (d % 30 === 0) for (const c of strategy.decide(s, rng)) s = applyCommand(s, c).state;
    const day = s.world.day;
    s = stepDay(s);
    const snap = s.snapshots[s.snapshots.length - 1]!;
    const y = dayToDate(day).year;
    const a = acc.get(y) ?? { rev: 0, cost: 0, dep: 0, seats: 0, pax: 0 };
    const fin = new Map(s.orders.flatMap((o) => o.aircraftIds.map((id) => [id, o.financing] as const)));
    for (const ac of s.world.fleet) if (ac.status !== "delivery" && (ac.financing ?? fin.get(ac.id)) === "purchase") a.dep += (typeById.get(ac.typeId)!.listPriceUsdM * 1e6 * 0.8) / (30 * 365.25);
    a.rev += snap.revenue; a.cost += snap.costs;
    for (const r of Object.values(s.routeReports)) {
      const ev = r.evaluation;
      if (ev.feasible && ev.seatsPerWeek > 0) { a.seats += ev.seatsPerWeek / 7; a.pax += ev.passengersPerWeek / 7; }
    }
    acc.set(y, a);
    if (s.credit?.bankrupt) { bankruptYear = y; break; }
  }
  const rows = [...acc.entries()].sort((x, y) => x[0] - y[0]).map(([year, a]) => ({
    year, revenue: a.rev, costs: a.cost, margin: a.rev > 0 ? (a.rev - a.cost) / a.rev : 0, adjMargin: a.rev > 0 ? (a.rev - a.cost - a.dep) / a.rev : 0, loadFactor: a.seats > 0 ? a.pax / a.seats : 0,
  }));
  return { strategy: strategy.name, seed, rows, bankruptYear, finalCash: s.world.cash };
}

export function formatRun(r: BalanceRun): string {
  const out = [`${r.strategy} seed ${r.seed}: final cash ${(r.finalCash / 1e6).toFixed(0)}M${r.bankruptYear ? `, BANKRUPT ${r.bankruptYear}` : ""}`];
  out.push("  year  revenue M  margin  after-deprec  LF");
  for (const x of r.rows) out.push(`  ${x.year}  ${(x.revenue / 1e6).toFixed(0).padStart(8)}  ${(100 * x.margin).toFixed(1).padStart(5)}%  ${(100 * x.adjMargin).toFixed(1).padStart(8)}%  ${(100 * x.loadFactor).toFixed(0)}%`);
  return out.join("\n");
}

if (process.argv[1]?.includes("vite-node") && !process.env.VITEST) {
  const games = arg("games", 3), years = arg("years", 15), seed = arg("seed", 1);
  const bots = sarg("bots", "passive,greedy").split(",").map((n) => (n === "greedy" ? greedy : passive));
  const runs: BalanceRun[] = [];
  for (const b of bots) for (let g = 0; g < games; g++) { const r = playBalance(b, seed + g, years); runs.push(r); console.log(formatRun(r)); }
  console.log("\nmargin % by year (rows: bot#seed)");
  const ys = [...new Set(runs.flatMap((r) => r.rows.map((x) => x.year)))].sort();
  console.log("run".padEnd(11) + ys.map((y) => String(y).slice(2).padStart(5)).join(""));
  for (const r of runs) console.log(`${r.strategy}#${r.seed}`.padEnd(11) + ys.map((y) => { const x = r.rows.find((q) => q.year === y); return (x ? (100 * x.margin).toFixed(0) : "-").padStart(5); }).join(""));
  console.log("\nmargin % after imputed depreciation of purchased aircraft");
  for (const r of runs) console.log(`${r.strategy}#${r.seed}`.padEnd(11) + ys.map((y) => { const x = r.rows.find((q) => q.year === y); return (x ? (100 * x.adjMargin).toFixed(0) : "-").padStart(5); }).join(""));
  console.log("\nrevenue M by year");
  for (const r of runs) console.log(`${r.strategy}#${r.seed}`.padEnd(11) + ys.map((y) => { const x = r.rows.find((q) => q.year === y); return (x ? (x.revenue / 1e6).toFixed(0) : "-").padStart(5); }).join(""));
  console.log("\nfinal cash M: " + runs.map((r) => `${r.strategy}#${r.seed} ${(r.finalCash / 1e6).toFixed(0)}${r.bankruptYear ? " BANKRUPT " + r.bankruptYear : ""}`).join(", "));
}
