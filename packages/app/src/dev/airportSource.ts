import { airports as dataAirports } from "@arg/data";
import type { Airport } from "@arg/contracts";
import { DEV_MIN_AIRPORTS, fixtureAirports } from "./fixtures";

// DEV ONLY: `?stress=N` swaps in a fabricated ~600 airport list (scripts/dev-stress-airports.mjs writes the gitignored file).
// The glob sits behind import.meta.env.DEV so production builds never include it, and it is empty when the file is absent.
const stressFiles: Record<string, { default: Airport[] }> = import.meta.env.DEV
  ? import.meta.glob("./stress-airports.local.json", { eager: true })
  : {};

function wantsStress(): boolean {
  try { return Number(new URLSearchParams(location.search).get("stress")) > 0; } catch { return false; }
}

/** The airports the UI works with: real data (or the tiny fixture list), or the dev stress list when `?stress` is set. */
export const uiAirports: Airport[] = (() => {
  const stress = wantsStress() ? Object.values(stressFiles)[0]?.default : undefined;
  if (stress?.length) return stress;
  return dataAirports.length >= DEV_MIN_AIRPORTS ? dataAirports : fixtureAirports;
})();
