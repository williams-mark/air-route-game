import { aircraftTypes, airports } from "@arg/data";
import { applyCommand } from "../commands";
import { makeRng, mixSeed } from "../rng";
import { startingScenario } from "../scenario";
import { stepDay } from "../index";
import type { SimState } from "../state";
import { STRATEGIES } from "../bots/strategies";
import { checkState } from "./invariants";

/** Usage: pnpm --filter @arg/sim soak [--games 30] [--years 10] [--seed 1] [--det 3] [--hub SIN] */
function arg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
}
const games = arg("games", 30), years = arg("years", 10), baseSeed = arg("seed", 1), detGames = arg("det", 3);
const days = Math.round(years * 365.25);
const hubIdx = process.argv.indexOf("--hub");
/** Optional `--hub SIN`: every game starts at that home airport instead of LAX. */
const hubArg: string | undefined = hubIdx >= 0 ? process.argv[hubIdx + 1] : undefined;

interface Out { seed: number; strategy: string; violations: string[]; cashIdentityMax: number; cashIdentityDays: number; ms: number; json: string; finalCash: number }

/** One seeded game with a bot. Checks invariants monthly (and the cheap ones on every snapshot). */
function play(seed: number, strategyIdx: number): Out {
  const strat = STRATEGIES[strategyIdx % STRATEGIES.length]!;
  const t0 = performance.now();
  const rng = makeRng(mixSeed(seed, 0xb07));
  let s: SimState = startingScenario(airports, aircraftTypes, seed, hubArg ? { hub: hubArg } : {});
  const violations: string[] = [];
  const note = (m: string) => { if (violations.length < 20) violations.push(m); };
  let idMax = 0, idDays = 0;
  let lastCash = s.world.cash;
  let cmdDay = false;
  for (let d = 0; d < days; d++) {
    cmdDay = false;
    if (d % 30 === 0) {
      for (const cmd of strat.decide(s, rng)) {
        const before = s.world.cash;
        try { s = applyCommand(s, cmd).state; } catch (e) { note(`day ${d}: command ${cmd.kind} threw ${(e as Error).message}`); }
        if (s.world.cash !== before) cmdDay = true;
      }
      lastCash = s.world.cash;
    }
    const ordersBefore = s.orders.length;
    const deliveringBefore = s.world.fleet.filter((a) => a.status === "delivery").length;
    try { s = stepDay(s); } catch (e) { note(`day ${d}: stepDay threw ${(e as Error).message}`); break; }
    const snap = s.snapshots[s.snapshots.length - 1];
    if (snap) {
      if (Math.abs(snap.profit - (snap.revenue - snap.costs)) > 1) note(`day ${d}: profit != revenue - costs (${snap.profit} vs ${snap.revenue - snap.costs})`);
      // Cash identity on quiet days: no command, no delivery-state change, no new order.
      const deliveringAfter = s.world.fleet.filter((a) => a.status === "delivery").length;
      const quiet = !cmdDay && deliveringAfter === deliveringBefore && s.orders.length === ordersBefore;
      if (quiet) { const diff = Math.abs(s.world.cash - lastCash - snap.profit); idDays++; if (diff > idMax) idMax = diff; }
    }
    lastCash = s.world.cash;
    if (d % 30 === 0 || d === days - 1) for (const m of checkState(s)) note(`day ${d}: ${m}`);
    if (violations.length >= 20) break;
  }
  return { seed, strategy: strat.name, violations, cashIdentityMax: idMax, cashIdentityDays: idDays, ms: performance.now() - t0, json: JSON.stringify(s), finalCash: s.world.cash };
}

const t0 = performance.now();
const results: Out[] = [];
for (let i = 0; i < games; i++) {
  const r = play(baseSeed + i, i);
  results.push(r);
  console.log(`game ${String(i + 1).padStart(2)}/${games} seed ${r.seed} ${r.strategy.padEnd(11)} ${(r.ms / 1000).toFixed(1)}s final cash ${(r.finalCash / 1e6).toFixed(0)}M violations ${r.violations.length}${r.violations[0] ? `  e.g. ${r.violations[0]}` : ""}`);
}
// Determinism: replay the first `detGames` games and compare JSON.
let detFail = 0;
for (let i = 0; i < Math.min(detGames, games); i++) {
  const again = play(baseSeed + i, i);
  if (again.json !== results[i]!.json) { detFail++; console.log(`DETERMINISM FAIL seed ${again.seed} ${again.strategy}`); }
}
const totalViol = results.reduce((a, r) => a + r.violations.length, 0);
const idMax = Math.max(0, ...results.map((r) => r.cashIdentityMax));
const idDays = results.reduce((a, r) => a + r.cashIdentityDays, 0);
const ms = results.map((r) => r.ms);
console.log("\n=== soak summary ===");
console.log(`games ${games} x ${years}y; games with violations ${results.filter((r) => r.violations.length).length}; total violations ${totalViol}`);
console.log(`cash identity (cash delta == snapshot profit on quiet days): ${idDays} days checked, max abs error USD ${idMax.toFixed(4)}`);
console.log(`determinism: ${Math.min(detGames, games) - detFail}/${Math.min(detGames, games)} replays byte-identical`);
console.log(`runtime: total ${((performance.now() - t0) / 1000).toFixed(1)}s, mean ${(ms.reduce((a, b) => a + b, 0) / ms.length / 1000).toFixed(1)}s, max ${(Math.max(...ms) / 1000).toFixed(1)}s per game`);
for (const r of results) for (const m of r.violations.slice(0, 5)) console.log(`VIOLATION seed ${r.seed} ${r.strategy}: ${m}`);
process.exitCode = totalViol > 0 || detFail > 0 || idMax > 1 ? 1 : 0;
