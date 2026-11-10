import type { Airport } from "@arg/contracts";
import { continentOf, countryName, regionName, type Continent } from "./geoNames";

/** Lower case, accents removed ("Zürich" -> "zurich"). */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface AirportFilter { continent?: Continent | null; country?: string | null; state?: string | null }
export interface SearchOpts { limit?: number; exclude?: readonly string[]; filter?: AirportFilter }

const matchesFilter = (a: Airport, f?: AirportFilter): boolean =>
  !f || ((!f.continent || continentOf(a.country) === f.continent) && (!f.country || a.country === f.country) && (!f.state || (a.country === "US" && a.region === f.state)));

/** Rank of one token against one airport (lower = better, -1 = no match). */
function tokenRank(t: string, a: Airport, idx: { id: string; city: string; name: string; region: string; country: string }): number {
  if (idx.id === t) return 0;
  if (idx.id.startsWith(t)) return 1;
  if (idx.city === t) return 2;
  if (idx.city.startsWith(t)) return 3;
  if (idx.name.startsWith(t) || idx.name.split(/[\s\-/()]+/).some((w) => w.startsWith(t) && t.length > 1)) return 4;
  if (idx.region.startsWith(t) || idx.country.startsWith(t) || a.region.toLowerCase() === t) return 5;
  if (idx.city.includes(t) || idx.name.includes(t)) return 6;
  if (idx.region.includes(t) || idx.country.includes(t)) return 7;
  return -1;
}

/**
 * Typeahead search by IATA code, city, airport name, state or country, ordered by relevance
 * (exact code, code prefix, city, name, region, substring) and then by airport size. An empty query lists the biggest airports.
 */
export function searchAirports(query: string, list: readonly Airport[], opts: SearchOpts = {}): Airport[] {
  const tokens = fold(query).split(/[\s,]+/).filter(Boolean);
  const skip = new Set(opts.exclude ?? []);
  const scored: Array<{ a: Airport; r: number }> = [];
  for (const a of list) {
    if (skip.has(a.id) || !matchesFilter(a, opts.filter)) continue;
    let r = 0;
    if (tokens.length) {
      const idx = { id: fold(a.id), city: fold(a.city), name: fold(a.name), region: fold(regionName(a)), country: fold(countryName(a.country)) };
      for (const t of tokens) {
        const k = tokenRank(t, a, idx);
        if (k < 0) { r = -1; break; }
        r += k;
      }
      if (r >= 0) r = r / tokens.length;
    } else r = 9;
    if (r >= 0) scored.push({ a, r });
  }
  scored.sort((x, y) => x.r - y.r || y.a.slotsPerHour - x.a.slotsPerHour || y.a.metroPopulation - x.a.metroPopulation || (x.a.id < y.a.id ? -1 : 1));
  return scored.slice(0, opts.limit ?? 50).map((x) => x.a);
}

export interface Facet { key: string; label: string; count: number }
export interface Facets { continents: Facet[]; countries: Facet[]; states: Facet[] }

/** Filter chips available for a list, narrowed by the choices made so far. Facets with fewer than two entries are omitted by the UI. */
export function airportFacets(list: readonly Airport[], f: AirportFilter = {}): Facets {
  const count = (items: Iterable<string>) => { const m = new Map<string, number>(); for (const k of items) m.set(k, (m.get(k) ?? 0) + 1); return m; };
  const toFacets = (m: Map<string, number>, label: (k: string) => string): Facet[] =>
    [...m].map(([key, n]) => ({ key, label: label(key), count: n })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const inContinent = f.continent ? list.filter((a) => continentOf(a.country) === f.continent) : list;
  const inCountry = f.country ? inContinent.filter((a) => a.country === f.country) : inContinent;
  return {
    continents: toFacets(count(list.map((a) => continentOf(a.country))), (k) => k),
    countries: toFacets(count(inContinent.map((a) => a.country)), countryName),
    states: toFacets(count(inCountry.filter((a) => a.country === "US").map((a) => a.region)), (k) => regionName({ region: k, country: "US" })),
  };
}

export type EnterOutcome = { kind: "choose"; id: string } | { kind: "keep" };

/**
 * What Enter does in an airport field. An exact IATA code in the text wins over the list's first row, and an untouched field
 * (text equals the committed code, no arrow keys used) keeps its airport: the list is unfiltered then and its first row is just the
 * biggest airport, which used to replace the origin the player had typed (LAX -> ATL).
 */
export function resolveEnter(input: {
  text: string; value: string | null; options: readonly Pick<Airport, "id">[]; index: number; navigated: boolean;
  list: readonly Pick<Airport, "id">[]; exclude?: readonly string[];
}): EnterOutcome {
  const typed = input.text.trim().toLowerCase();
  const skip = new Set(input.exclude ?? []);
  const highlighted = input.options[input.index];
  if (input.navigated && highlighted) return { kind: "choose", id: highlighted.id };
  const exact = typed ? input.list.find((a) => a.id.toLowerCase() === typed && !skip.has(a.id)) : undefined;
  if (exact) return { kind: "choose", id: exact.id };
  if (input.value && typed === input.value.toLowerCase()) return { kind: "keep" };
  if (highlighted) return { kind: "choose", id: highlighted.id };
  return { kind: "keep" };
}
