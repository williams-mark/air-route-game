import { describe, expect, it } from "vitest";
import { airports } from "@arg/data";
import { benchmarkFareFor } from "../demand/fares";
import { jetAPriceUsdPerGallon, baseJetAPriceUsdPerGallon } from "../finance/fuel";
import { costFactors, fareLevel, isEurope, regionGroupOf, TIERS } from "./regions";

const A = new Map(airports.map((a) => [a.id, a]));
const ap = (id: string) => A.get(id)!;
const d = Math.round(4.4 * 365.25);

const EU = new Set([
  "GB", "JE", "GG", "IM", "IE", "FR", "DE", "NL", "BE", "LU", "CH", "AT", "IT", "ES", "PT", "DK", "SE", "NO", "FI", "IS", "EE", "LV", "LT", "PL", "CZ", "HU",
  "SK", "RO", "BG", "SI", "HR", "RS", "BA", "ME", "MK", "AL", "XK", "GR", "CY", "MT",
]);

describe("regional cost and fare tiers (outside US and Europe)", () => {
  it("every country in the data has a group, and only the European countries are Europe", () => {
    const countries = [...new Set(airports.map((a) => a.country))];
    for (const c of EU) expect(regionGroupOf(c), c).toBe("europe");
    for (const c of countries.filter((x) => !EU.has(x))) expect(regionGroupOf(c), c).not.toBe("europe");
    for (const a of airports) expect(isEurope(a)).toBe(EU.has(a.country));
  });

  it("the Europe and US baselines are unchanged", () => {
    expect(costFactors(ap("LAX"), ap("SFO"))).toEqual({ airport: 1, handling: 1, labour: 1 });
    expect(costFactors(ap("FRA"), ap("FRA"))).toEqual({ airport: 1.3, handling: 1.15, labour: 1 });
    expect(costFactors(ap("WAW"), ap("WAW")).labour).toBe(0.5);
    expect(fareLevel(ap("LAX"), ap("JFK"))).toBe(1);
    const g = (ap("FRA").gdpPerCapita / 40000) ** 0.3;
    expect(fareLevel(ap("FRA"), ap("FRA"))).toBe(0.8 * Math.min(1.25 / 0.8, Math.max(0.7 / 0.8, g)));
    expect(jetAPriceUsdPerGallon(d, ap("OSL"))).toBeGreaterThan(jetAPriceUsdPerGallon(d, ap("FRA")));
  });

  it("each region has its own tier, ordered sensibly against the US and Europe", () => {
    const c = (id: string) => costFactors(ap(id), ap(id));
    expect(c("SIN")).toEqual({ airport: TIERS.southeastAsia.airport, handling: TIERS.southeastAsia.handling, labour: TIERS.southeastAsia.labour });
    expect(c("DEL").labour).toBeLessThan(c("GRU").labour);
    expect(c("GRU").labour).toBeLessThan(c("SYD").labour);
    expect(c("SYD").labour).toBeLessThan(1);
    expect(c("NRT").airport).toBeGreaterThan(c("DXB").airport);
    for (const id of ["SIN", "GRU", "DXB", "SYD", "JNB", "DEL", "NRT", "YYZ", "MEX"]) expect(c(id).airport, id).not.toBe(1.3);
    const base = baseJetAPriceUsdPerGallon(d);
    expect(jetAPriceUsdPerGallon(d, ap("DXB"))).toBeLessThan(base);
    expect(jetAPriceUsdPerGallon(d, ap("DEL"))).toBeGreaterThan(base);
    expect(jetAPriceUsdPerGallon(d, ap("SYD"))).toBeGreaterThan(base);
  });

  it("fare levels follow the tiers and stay in each group's range", () => {
    const lvl = (id: string) => fareLevel(ap(id), ap(id));
    for (const a of airports) {
      const g = regionGroupOf(a.country);
      if (g === "europe") continue;
      const t = TIERS[g];
      expect(fareLevel(a, a), a.id).toBeGreaterThanOrEqual(t.fareRange[0] - 1e-9);
      expect(fareLevel(a, a), a.id).toBeLessThanOrEqual(t.fareRange[1] + 1e-9);
    }
    expect(lvl("DEL")).toBeLessThan(lvl("SYD"));
    expect(lvl("DEL")).toBeLessThan(1);
    expect(benchmarkFareFor(ap("LAX"), ap("SYD"))).toBeGreaterThan(benchmarkFareFor(ap("DEL"), ap("BOM")));
  });

  it("US territories keep US cost factors", () => {
    for (const id of ["SJU", "GUM"]) if (A.has(id)) expect(costFactors(ap(id), ap(id))).toEqual({ airport: 1, handling: 1, labour: 1 });
  });
});
