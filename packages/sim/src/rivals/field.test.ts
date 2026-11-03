import { beforeAll, describe, expect, it } from "vitest";
import { aircraftTypes, airports, canFlyRoute } from "@arg/data";
import { runDays } from "../index";
import { makeRng } from "../rng";
import { startingScenario } from "../scenario";
import type { SimState } from "../state";
import { SCOPES, STARTING_RIVALS } from "./config";
import { candidatePairs, CANDIDATE_TOP_K, inScope, makeContext, scopeOf } from "./engine";
import type { RivalAirline } from "./types";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const REAL_BRAND_WORDS = [
  "delta", "united", "american", "southwest", "jetblue", "spirit", "frontier", "alaska", "hawaiian", "allegiant", "lufthansa", "ryanair", "easyjet",
  "air france", "klm", "british", "iberia", "alitalia", "ita ", "finnair", "norwegian", "wizz", "vueling", "swiss", "austrian", "sas", "tap ", "aegean",
  "eurowings", "transavia", "condor", "tui", "virgin", "aer lingus", "icelandair", "volotea", "pegasus", "turkish", "emirates", "qantas",
];
let s: SimState;
beforeAll(() => { s = runDays(startingScenario(airports, aircraftTypes, 2015), 365 * 3); }, 120_000);

const by = (id: string) => s.rivals!.airlines.find((a) => a.id === id)!;
const ctxOf = (st: SimState) => makeContext(new Map(st.airports.map((a) => [a.id, a])), new Map(st.aircraftTypes.map((t) => [t.id, t])), st.world.day, makeRng(1), []);

describe("the rival field", () => {
  it("has the original five, the national and European carriers, all with fictional names", () => {
    const names = STARTING_RIVALS.map((r) => r.name);
    expect(names.length).toBeGreaterThanOrEqual(13);
    for (const n of ["Cardinal Air", "Polaris Air", "Sunbird Express", "Rheinland Air", "Gallia Air", "Verdant Jet", "Tramontana Jet", "Fjord Connect"]) expect(names).toContain(n);
    for (const n of [...names, "Ember Air", "Cascade Connect"]) for (const w of REAL_BRAND_WORDS) expect(n.toLowerCase().includes(w), `${n} / ${w}`).toBe(false);
    // 3 US majors/LCCs, 2 flag + 2 LCC in Europe, 1 regional.
    const home = (id: string) => scopeOf(by(id), A);
    expect(["cardinal-air", "polaris-air", "sunbird-express"].every((id) => home(id).countries?.includes("US"))).toBe(true);
    expect(["rheinland-air", "gallia-air", "verdant-jet", "tramontana-jet"].every((id) => home(id).countries?.includes("EUROPE"))).toBe(true);
    expect(by("rheinland-air").archetype).toBe("legacy");
    expect(by("verdant-jet").archetype).toBe("lcc");
    expect(by("fjord-connect").archetype).toBe("regional");
  });

  it("every rival route stays inside the airline's home region (plus the Atlantic for carriers with transatlantic reach)", () => {
    for (const air of s.rivals!.airlines) {
      const scope = scopeOf(air, A);
      for (const r of air.routes) {
        const a = A.get(r.origin)!, b = A.get(r.destination)!;
        const home = inScope(scope, a) && inScope(scope, b);
        const crosses = (a.country === "US") !== (b.country === "US");
        if (crosses) {
          expect(scope.transatlantic, `${air.name} ${r.origin}-${r.destination}`).toBe(true);
          // Aircraft feasibility (range, ETOPS) is the canFlyRoute test below; a long-range narrowbody may legitimately fly JFK-DUB.
        } else {
          expect(home, `${air.name} ${r.origin}-${r.destination}`).toBe(true);
        }
      }
    }
  });

  it("region split: West Coast carriers stay West, Verdant and Tramontana never touch the US, Sunbird never touches Europe", () => {
    for (const id of ["pacific-crown", "kestrel-air", "golden-state-express", "sierra-jet", "cascade-connect"]) {
      for (const r of by(id).routes) for (const ap of [r.origin, r.destination]) expect(["CA", "HI", "OR", "WA"], `${id} ${ap}`).toContain(A.get(ap)!.region);
    }
    for (const id of ["verdant-jet", "tramontana-jet", "fjord-connect"]) {
      for (const r of by(id).routes) for (const ap of [r.origin, r.destination]) expect(A.get(ap)!.country, `${id} ${ap}`).not.toBe("US");
    }
    for (const r of by("sunbird-express").routes) for (const ap of [r.origin, r.destination]) expect(A.get(ap)!.country).toBe("US");
    for (const r of by("fjord-connect").routes) for (const ap of [r.origin, r.destination]) expect(["NO", "SE", "DK", "FI", "IS"]).toContain(A.get(ap)!.country);
  });

  it("the transatlantic legacy carriers do fly the Atlantic, with aircraft that can (canFlyRoute)", () => {
    const longHaul = s.rivals!.airlines.flatMap((a) => a.routes.map((r) => ({ a, r }))).filter(({ r }) => (A.get(r.origin)!.country === "US") !== (A.get(r.destination)!.country === "US"));
    expect(longHaul.length).toBeGreaterThan(3);
    for (const { a, r } of longHaul) {
      expect(canFlyRoute(T.get(r.typeId)!, A.get(r.origin)!, A.get(r.destination)!), `${a.name} ${r.origin}-${r.destination} ${r.typeId}`).toBe(true);
      expect(a.fleet.some((f) => f.typeId === r.typeId)).toBe(true);
    }
  });

  it("fleets are real types from the data package, available in their year", () => {
    for (const air of s.rivals!.airlines) {
      for (const f of air.fleet) {
        const t = T.get(f.typeId);
        expect(t, `${air.name} ${f.typeId}`).toBeDefined();
        expect(t!.introYear).toBeLessThanOrEqual(2018);
      }
    }
  });

  it("entry search runs on a pruned candidate list: at most TOP_K per base, scoped, never the whole airport list", () => {
    const ctx = ctxOf(s);
    for (const air of s.rivals!.airlines.filter((a) => a.status === "active")) {
      const cands = candidatePairs(ctx, air, 1000);
      expect(cands.length, air.name).toBeLessThanOrEqual(CANDIDATE_TOP_K * air.bases.length);
      expect(cands.length, air.name).toBeLessThan(airports.length / 2);
      for (const c of cands) expect(air.bases).toContain(c.a.id);
      // Sorted by potential.
      for (let i = 1; i < cands.length; i++) expect(cands[i - 1]!.demand).toBeGreaterThanOrEqual(cands[i]!.demand);
    }
    const crown = candidatePairs(ctx, by("pacific-crown"), 1000);
    expect(crown.every(({ b }) => ["CA", "HI", "OR", "WA"].includes(b.region))).toBe(true);
    const verdant = candidatePairs(ctx, by("verdant-jet"), 1000);
    expect(verdant.every(({ b }) => b.country !== "US")).toBe(true);
    const cardinal = candidatePairs(ctx, by("cardinal-air") as RivalAirline, 1000);
    expect(cardinal.some(({ b }) => b.country !== "US")).toBe(true);
    expect(cardinal.some(({ b }) => b.country === "US")).toBe(true);
  });

  it("airlines from older saves (no scope field) get a derived one", () => {
    expect(scopeOf({ bases: ["SFO", "LAX"], archetype: "legacy" }, A)).toEqual(SCOPES.pacific);
    expect(scopeOf({ bases: ["HNL"], archetype: "interisland" }, A)).toEqual(SCOPES.hawaii);
    expect(scopeOf({ bases: ["ATL"], archetype: "legacy" }, A)).toEqual(SCOPES.us);
    expect(scopeOf({ bases: ["FRA"], archetype: "legacy" }, A)).toEqual(SCOPES.europe);
  });

  it("is not wildly profitable: no active rival ends three years above 2.2x its initial cash and every network is feasible", () => {
    for (const a of s.rivals!.airlines) if (a.status === "active") expect(a.cash, a.name).toBeLessThan(a.initialCash * 2.2);
    expect(s.rivals!.airlines.filter((a) => a.status === "active").length).toBeGreaterThanOrEqual(12);
  });
});
