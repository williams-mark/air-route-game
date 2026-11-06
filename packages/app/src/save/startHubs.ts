import type { Airport } from "@arg/contracts";
import { CONTINENT_ORDER, continentOf, type Continent } from "../routes/geoNames";

/** How many home airports the start screen offers: the sim's `hubCandidates` (largest airports worldwide, LAX first). Every one was checked to start with at least three routes. */
export const START_HUB_COUNT = 150;

export interface HubGroup { continent: Continent; hubs: Airport[] }

/** Candidates grouped by continent in `CONTINENT_ORDER`, keeping the sim's order (largest first, LAX first) inside each group. Empty groups are omitted. */
export function hubsByContinent(hubs: readonly Airport[]): HubGroup[] {
  const groups = new Map<Continent, Airport[]>();
  for (const h of hubs) {
    const c = continentOf(h.country);
    const list = groups.get(c);
    if (list) list.push(h); else groups.set(c, [h]);
  }
  return CONTINENT_ORDER.filter((c) => groups.has(c)).map((continent) => ({ continent, hubs: groups.get(continent)! }));
}
