// DEV-ONLY placeholder data used when @arg/data has fewer than DEV_MIN_AIRPORTS airports.
// Coordinates are approximate real airport locations; economic fields are rough placeholders
// and must never be treated as sourced data (see CLAUDE.md data rules).
import type { Airport } from "@arg/contracts";
import type { MapRoute, ProfitTier } from "../map/types";

export const DEV_MIN_AIRPORTS = 12;

const a = (id: string, name: string, city: string, lat: number, lon: number, region: "CA" | "HI", pop: number, slots: number): Airport => ({
  id, name, city, lat, lon, region, runwayM: 3000, metroPopulation: pop, gdpPerCapita: 70000, tourismIndex: 0.5, slotsPerHour: slots,
});

export const fixtureAirports: Airport[] = [
  a("LAX", "Los Angeles Intl", "Los Angeles", 33.9425, -118.4081, "CA", 13_200_000, 100),
  a("SFO", "San Francisco Intl", "San Francisco", 37.6213, -122.379, "CA", 4_700_000, 80),
  a("SAN", "San Diego Intl", "San Diego", 32.7336, -117.1897, "CA", 3_300_000, 50),
  a("SJC", "Norman Y. Mineta San Jose Intl", "San Jose", 37.3626, -121.9291, "CA", 2_000_000, 40),
  a("OAK", "Oakland Intl", "Oakland", 37.7213, -122.2208, "CA", 4_700_000, 40),
  a("SMF", "Sacramento Intl", "Sacramento", 38.6954, -121.5908, "CA", 2_400_000, 40),
  a("BUR", "Hollywood Burbank", "Burbank", 34.2007, -118.3585, "CA", 13_200_000, 30),
  a("SNA", "John Wayne Orange County", "Santa Ana", 33.6757, -117.8682, "CA", 3_200_000, 30),
  a("HNL", "Daniel K. Inouye Intl", "Honolulu", 21.3187, -157.9225, "HI", 1_000_000, 60),
  a("OGG", "Kahului", "Kahului", 20.8986, -156.4305, "HI", 170_000, 30),
  a("KOA", "Kona Intl", "Kailua-Kona", 19.7388, -156.0456, "HI", 200_000, 20),
  a("LIH", "Lihue", "Lihue", 21.976, -159.339, "HI", 73_000, 15),
];

const pairs: [string, string, number, ProfitTier][] = [
  ["LAX", "SFO", 56, "profit"], ["LAX", "SAN", 14, "marginal"], ["LAX", "SJC", 28, "profit"], ["LAX", "OAK", 21, "profit"],
  ["LAX", "SMF", 28, "marginal"], ["SFO", "SAN", 28, "profit"], ["SFO", "BUR", 21, "marginal"], ["SFO", "SNA", 21, "profit"],
  ["SJC", "SAN", 14, "marginal"], ["OAK", "SAN", 14, "loss"], ["SMF", "SNA", 7, "loss"], ["SMF", "BUR", 7, "planned"],
  ["LAX", "HNL", 42, "profit"], ["SFO", "HNL", 35, "profit"], ["SAN", "HNL", 14, "marginal"], ["SJC", "HNL", 14, "profit"],
  ["OAK", "HNL", 14, "marginal"], ["SMF", "HNL", 7, "loss"], ["SNA", "HNL", 7, "planned"], ["BUR", "HNL", 7, "planned"],
  ["LAX", "OGG", 28, "profit"], ["SFO", "OGG", 21, "profit"], ["SAN", "OGG", 7, "loss"], ["SJC", "OGG", 7, "marginal"],
  ["LAX", "KOA", 14, "marginal"], ["SFO", "KOA", 7, "loss"], ["OAK", "KOA", 7, "planned"], ["LAX", "LIH", 14, "profit"],
  ["SFO", "LIH", 7, "marginal"], ["HNL", "OGG", 70, "profit"], ["HNL", "KOA", 56, "profit"], ["HNL", "LIH", 49, "marginal"],
  ["OGG", "KOA", 14, "loss"], ["OGG", "LIH", 7, "planned"],
];

export const fixtureRoutes: MapRoute[] = pairs.map(([o, d, f, tier]) => ({
  id: `${o}-${d}`, origin: o, destination: d, weeklyFrequency: f, fares: { Y: 150 }, typeId: "B737-800", tier,
  weeklyProfitUsd: tier === "profit" ? f * 3200 : tier === "marginal" ? f * 150 : tier === "loss" ? -f * 1800 : undefined,
}));

/** Deterministic pseudo-random routes to stress-test rendering (e.g. ?stress=500). */
export function stressRoutes(airports: Airport[], n: number): MapRoute[] {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const tiers: ProfitTier[] = ["profit", "profit", "marginal", "loss", "planned"];
  const seen = new Set<string>();
  const out: MapRoute[] = [];
  let guard = n * 20;
  while (out.length < n && guard-- > 0 && airports.length > 1) {
    const o = airports[Math.floor(rnd() * airports.length)]!, d = airports[Math.floor(rnd() * airports.length)]!;
    const id = `${o.id}-${d.id}`;
    if (o.id === d.id || seen.has(id) || seen.has(`${d.id}-${o.id}`)) continue;
    seen.add(id);
    out.push({ id, origin: o.id, destination: d.id, weeklyFrequency: 3 + Math.floor(rnd() * 40), fares: { Y: 120 }, typeId: "B737-800", tier: tiers[Math.floor(rnd() * tiers.length)]! });
  }
  return out;
}
