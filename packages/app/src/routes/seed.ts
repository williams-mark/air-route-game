// Demo starting network for the mock bridge: the dev fixture pairs, flown with the best-fitting real aircraft type.
import type { Route } from "@arg/contracts";
import { distanceKm } from "@arg/data";
import { fixtureRoutes } from "../dev/fixtures";
import { bestType, dataWorld, marketFares } from "./helpers";

export function seedRoutes(): Route[] {
  const out: Route[] = [];
  fixtureRoutes.forEach((fr, i) => {
    const a = dataWorld.airports.get(fr.origin), b = dataWorld.airports.get(fr.destination);
    if (!a || !b) return;
    const t = bestType(a, b, 0, fr.weeklyFrequency);
    if (!t) return;
    const km = distanceKm(a, b);
    const m = marketFares(km);
    const k = 0.92 + ((i * 7) % 9) / 40; // deterministic spread around the market fare
    const fares: Route["fares"] = { Y: Math.round(m.Y * k) };
    if (km > 1500) { fares.W = Math.round(m.W * k); fares.J = Math.round(m.J * k); }
    out.push({ id: fr.id, origin: a.id, destination: b.id, weeklyFrequency: fr.weeklyFrequency, fares, typeId: t.id });
  });
  return out;
}
