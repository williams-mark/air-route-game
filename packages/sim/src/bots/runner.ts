import type { AircraftType, Airport } from "@arg/contracts";
import { applyCommand } from "../commands";
import { makeRng, mixSeed } from "../rng";
import { startingScenario, STARTING_CASH_USD } from "../scenario";
import { stepDay } from "../index";
import type { SimState } from "../state";
import { STRATEGIES, type Strategy } from "./strategies";

export interface GameOptions {
  years: number;
  /** Days between bot decisions. */
  decisionEveryDays?: number;
  /** Cash above this multiple of the starting cash counts as an exploit. */
  exploitMultiple?: number;
  /** The company is bankrupt after this many consecutive days of negative cash. */
  bankruptAfterDays?: number;
}

export interface GameResult {
  seed: number;
  strategy: string;
  days: number;
  finalCash: number;
  peakCash: number;
  minCash: number;
  bankrupt: boolean;
  bankruptDay: number | null;
  exploit: boolean;
  /** Largest single-year cash multiple (cash at year end / cash at year start, when the start is positive). */
  maxYearMultiple: number;
  /** Highest route margin seen with real revenue (a sanity flag, not an exploit by itself). */
  maxRouteMargin: number;
  commandsOk: number;
  commandsFailed: number;
  crash: string | null;
  ms: number;
}

const DAYS_PER_YEAR = 365.25;

export function runGame(airports: Airport[], types: AircraftType[], seed: number, strategy: Strategy, opts: GameOptions): GameResult {
  const decisionEvery = opts.decisionEveryDays ?? 30;
  const exploitMultiple = opts.exploitMultiple ?? 50;
  const bankruptAfter = opts.bankruptAfterDays ?? 60;
  const t0 = performance.now();
  const rng = makeRng(mixSeed(seed, 0xb07));
  const totalDays = Math.round(opts.years * DAYS_PER_YEAR);
  const r: GameResult = {
    seed, strategy: strategy.name, days: 0, finalCash: STARTING_CASH_USD, peakCash: STARTING_CASH_USD, minCash: STARTING_CASH_USD,
    bankrupt: false, bankruptDay: null, exploit: false, maxYearMultiple: 1, maxRouteMargin: -Infinity, commandsOk: 0, commandsFailed: 0, crash: null, ms: 0,
  };
  let state: SimState = startingScenario(airports, types, seed);
  let negative = 0;
  let yearStartCash = STARTING_CASH_USD;
  try {
    for (let day = 0; day < totalDays; day++) {
      if (day % decisionEvery === 0) {
        for (const cmd of strategy.decide(state, rng)) {
          const out = applyCommand(state, cmd);
          state = out.state;
          if (out.result.ok) r.commandsOk++; else r.commandsFailed++;
        }
      }
      state = stepDay(state);
      const cash = state.world.cash;
      if (!Number.isFinite(cash)) throw new Error(`non-finite cash on day ${day}`);
      r.days = day + 1;
      r.finalCash = cash;
      if (cash > r.peakCash) r.peakCash = cash;
      if (cash < r.minCash) r.minCash = cash;
      negative = cash < 0 ? negative + 1 : 0;
      if (negative >= bankruptAfter) { r.bankrupt = true; r.bankruptDay = day; break; }
      if (cash > exploitMultiple * STARTING_CASH_USD) { r.exploit = true; break; }
      if (day % 30 === 0) {
        for (const rep of Object.values(state.routeReports)) {
          if (rep.evaluation.revenue > 100_000 && rep.evaluation.margin > r.maxRouteMargin) r.maxRouteMargin = rep.evaluation.margin;
        }
      }
      if ((day + 1) % 365 === 0) {
        if (yearStartCash > 1e6) r.maxYearMultiple = Math.max(r.maxYearMultiple, cash / yearStartCash);
        yearStartCash = cash;
      }
    }
  } catch (e) {
    r.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 4).join("\n")}` : String(e);
  }
  r.ms = performance.now() - t0;
  return r;
}

export interface BatchSummary {
  games: number;
  years: number;
  results: GameResult[];
  byStrategy: Record<string, { games: number; bankrupt: number; exploits: number; crashes: number; cashM: number[]; medianM: number; meanMs: number }>;
  bankruptcies: number;
  exploits: GameResult[];
  crashes: GameResult[];
  totalMs: number;
  maxMs: number;
  meanMs: number;
}

const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};

export function runBatch(airports: Airport[], types: AircraftType[], games: number, opts: GameOptions, strategies: readonly Strategy[] = STRATEGIES, baseSeed = 1): BatchSummary {
  const results: GameResult[] = [];
  const t0 = performance.now();
  for (let i = 0; i < games; i++) {
    const strat = strategies[i % strategies.length]!;
    results.push(runGame(airports, types, baseSeed + i, strat, opts));
  }
  const byStrategy: BatchSummary["byStrategy"] = {};
  for (const s of strategies) {
    const rs = results.filter((x) => x.strategy === s.name);
    const cash = rs.map((x) => x.finalCash / 1e6);
    byStrategy[s.name] = {
      games: rs.length, bankrupt: rs.filter((x) => x.bankrupt).length, exploits: rs.filter((x) => x.exploit).length,
      crashes: rs.filter((x) => x.crash).length, cashM: cash, medianM: quantile(cash, 0.5),
      meanMs: rs.length ? rs.reduce((a, x) => a + x.ms, 0) / rs.length : 0,
    };
  }
  const ms = results.map((x) => x.ms);
  return {
    games, years: opts.years, results, byStrategy,
    bankruptcies: results.filter((x) => x.bankrupt).length,
    exploits: results.filter((x) => x.exploit),
    crashes: results.filter((x) => x.crash),
    totalMs: performance.now() - t0, maxMs: Math.max(0, ...ms), meanMs: ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length),
  };
}

export function formatSummary(b: BatchSummary): string {
  const out: string[] = [];
  out.push(`Balance bots: ${b.games} games x ${b.years} years (2015 start, USD ${STARTING_CASH_USD / 1e6}M cash)`);
  out.push(`bankruptcies ${b.bankruptcies}/${b.games}, exploits ${b.exploits.length}, crashes ${b.crashes.length}; runtime total ${(b.totalMs / 1000).toFixed(1)}s, mean ${(b.meanMs / 1000).toFixed(1)}s, max ${(b.maxMs / 1000).toFixed(1)}s per game`);
  out.push("");
  out.push("strategy      games  bankrupt  exploit  crash   final cash USD M: min / p25 / median / p75 / max      mean s");
  for (const [name, s] of Object.entries(b.byStrategy)) {
    const c = s.cashM;
    const f = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : "-").padStart(7);
    out.push(`${name.padEnd(13)} ${String(s.games).padStart(5)} ${String(s.bankrupt).padStart(9)} ${String(s.exploits).padStart(8)} ${String(s.crashes).padStart(6)}   ${f(Math.min(...c))} ${f(quantile(c, 0.25))} ${f(quantile(c, 0.5))} ${f(quantile(c, 0.75))} ${f(Math.max(...c))}   ${(s.meanMs / 1000).toFixed(1).padStart(6)}`);
  }
  const hi = [...b.results].sort((x, y) => y.finalCash - x.finalCash).slice(0, 3);
  out.push("");
  out.push("richest runs: " + hi.map((x) => `${x.strategy}#${x.seed} ${(x.finalCash / 1e6).toFixed(0)}M (best year x${x.maxYearMultiple.toFixed(2)}, best route margin ${(100 * x.maxRouteMargin).toFixed(0)}%)`).join("; "));
  for (const x of b.exploits) out.push(`EXPLOIT? ${x.strategy}#${x.seed}: cash ${(x.finalCash / 1e6).toFixed(0)}M on day ${x.days}`);
  for (const x of b.crashes) out.push(`CRASH ${x.strategy}#${x.seed} day ${x.days}: ${x.crash}`);
  return out.join("\n");
}
