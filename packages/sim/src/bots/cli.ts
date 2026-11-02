import { aircraftTypes, airports } from "@arg/data";
import { formatSummary, runBatch } from "./runner";

/** Usage: pnpm --filter @arg/sim bots [--games N] [--years Y] [--seed S] */
function arg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
}

const games = arg("games", 12);
const years = arg("years", 10);
const summary = runBatch(airports, aircraftTypes, games, { years }, undefined, arg("seed", 1));
console.log(formatSummary(summary));
process.exitCode = summary.crashes.length > 0 ? 1 : 0;
