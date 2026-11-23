import { describe, expect, it } from "vitest";
import { airports } from "@arg/data";
import { buildModel } from "./model";
import { buildStaticLayers, routeWidth } from "./layers";
import type { MapColors } from "./colors";

const colors = new Proxy({}, { get: () => [0, 0, 0, 255] }) as unknown as MapColors;
const routes = [["LAX", "SFO"], ["LAX", "SEA"], ["SFO", "SEA"], ["JFK", "LHR"]].map(([o, d], i) => ({
  id: `r${i}`, origin: o!, destination: d!, weeklyFrequency: 14, tier: "profit" as const,
}));
const model = buildModel(airports, routes as never);
const drawnIds = (band: "far" | "mid", focus: string | null) => {
  const layer = buildStaticLayers({ model, colors, band, selectedRoute: null, selectedAirport: null, focusAirport: focus, dark: false, labelIds: null }).find((l) => l.id === "routes")!;
  return (layer.props.data as Array<{ route: { id: string } }>).map((g) => g.route.id).sort();
};

describe("map routes (23 Nov 2026)", () => {
  it("every route is drawn as itself when zoomed out: no corridors", () => {
    expect(drawnIds("far", null)).toEqual(["r0", "r1", "r2", "r3"]);
    expect(drawnIds("mid", null)).toEqual(["r0", "r1", "r2", "r3"]);
  });
  it("a focused city draws only the routes touching it", () => {
    expect(drawnIds("far", "LAX")).toEqual(["r0", "r1"]);
    expect(drawnIds("mid", "SEA")).toEqual(["r1", "r2"]);
    expect(drawnIds("mid", "SLE")).toEqual([]);
  });
  it("lines are a third of the old width", () => {
    expect(routeWidth(14)).toBeCloseTo((1 + Math.sqrt(14) * 0.75) / 3);
    expect(routeWidth(200)).toBe(2.4);
    expect(routeWidth(1)).toBe(0.6);
  });
});
