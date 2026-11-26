// Difficulty curve probe (owner, 26 Nov 2026: "competitive within about 10 years"). Plays the world field from 2015 with the passive and
// greedy bots for N years and prints, per year: net margin, cash, active competitors, competitor seats in the player's markets and in
// markets at the player's home hub, competitors' outstations at the player's bases, and market events (consolidation, offers).
// Usage: pnpm --filter @arg/sim exec vite-node src/qa/tenYear.ts [--years 12] [--seeds 1,2] [--difficulty medium] [--strategies passive,greedy]
import { aircraftTypes, airports } from "@arg/data";
import type { AircraftType, Airport } from "@arg/contracts";
import { startingScenario } from "../scenario";
import { applyCommand, stepDay } from "../index";
import { greedy, passive, type Strategy } from "../bots/strategies";
import { makeRng, mixSeed } from "../rng";
import { marketKey } from "../rivals";
import { basesOf, homeHubOf } from "../fleet/hubs";
import type { SimState } from "../state";
import { playerValuation } from "../market/market";

const argv = process.argv.slice(2);
const flag = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1]! : d; };
const years = Number(flag("years", "12"));
const seeds = flag("seeds", "1,2").split(",").map(Number);
const difficulty = flag("difficulty", "medium") as "easy" | "medium" | "hard";
const strategies: Strategy[] = flag("strategies", "passive,greedy").split(",").map((n) => (n === "greedy" ? greedy : passive));

function rivalSeatsInPlayerMarkets(s: SimState): { player: number; home: number; outstationsAtBases: number } {
  const keys = new Set(s.world.routes.map((r) => marketKey(r.origin, r.destination)));
  const home = homeHubOf(s);
  const bases = new Set(basesOf(s));
  let player = 0, atHome = 0, outs = 0;
  for (const a of s.rivals?.airlines ?? []) {
    if (a.status !== "active") continue;
    outs += (a.outstations ?? []).filter((o) => bases.has(o)).length;
    for (const r of a.routes) {
      const seats = r.frequency * r.seatsPerFlight;
      if (keys.has(marketKey(r.origin, r.destination))) player += seats;
      if (r.origin === home || r.destination === home) atHome += seats;
    }
  }
  return { player, home: atHome, outstationsAtBases: outs };
}

export function probe(seed: number, strategy: Strategy, ap: Airport[], ty: AircraftType[]) {
  let s = startingScenario(ap, ty, seed, { rivalField: "world", difficulty, presentYear: 2026, campaignYears: null });
  const rng = makeRng(mixSeed(seed, 0xb07));
  const rows: string[] = [];
  let rev = 0, prof = 0;
  for (let day = 0; day < Math.round(years * 365.25); day++) {
    if (day % 30 === 0) for (const cmd of strategy.decide(s, rng)) s = applyCommand(s, cmd).state;
    s = stepDay(s);
    const snap = s.snapshots[s.snapshots.length - 1]!;
    rev += snap.revenue; prof += snap.profit;
    if (s.credit?.bankrupt) { rows.push(`  bankrupt on day ${day}`); break; }
    if ((day + 1) % 365 === 0) {
      const c = rivalSeatsInPlayerMarkets(s);
      const active = s.rivals?.airlines.filter((a) => a.status === "active").length ?? 0;
      const acquired = s.rivals?.airlines.filter((a) => a.status === "acquired").length ?? 0;
      const v = playerValuation(s);
      rows.push(`  y${String((day + 1) / 365).padStart(2)} margin ${(rev > 0 ? (100 * prof) / rev : 0).toFixed(1).padStart(6)}%  cash ${(s.world.cash / 1e6).toFixed(0).padStart(5)}M  value ${(v.valueUsd / 1e6).toFixed(0).padStart(5)}M  routes ${String(s.world.routes.length).padStart(3)}  rivals ${active} (+${acquired} acquired)  rival seats/wk in your markets ${c.player}  at your hub ${c.home}  rival outstations at your bases ${c.outstationsAtBases}  offers ${s.market?.incoming.length ?? 0}`);
      rev = 0; prof = 0;
    }
  }
  return rows;
}

{
  for (const seed of seeds) for (const st of strategies) {
    const t0 = Date.now();
    const rows = probe(seed, st, airports as Airport[], aircraftTypes as AircraftType[]);
    console.log(`seed ${seed} ${st.name} ${difficulty} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    for (const r of rows) console.log(r);
  }
}
