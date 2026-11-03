import { describe, expect, it } from "vitest";
import { airportById } from "@arg/data";
import type { Route } from "@arg/contracts";
import { bestType, marketFares } from "../routes/helpers";
import { effectText, fareCutEffects } from "./fareCut";

const DAY = 100;
const lax = airportById.get("LAX")!;
const sfo = airportById.get("SFO")!;
const type = bestType(lax, sfo, DAY)!;
const route: Route = { id: "r1", origin: "LAX", destination: "SFO", weeklyFrequency: 14, fares: { Y: marketFares(559).Y }, typeId: type.id };

describe("fareCutEffects", () => {
  const e = fareCutEffects(route, DAY, 10, true);
  it("evaluates a feasible route", () => { expect(e).not.toBeNull(); });
  it("holding fares against a cheaper rival never gains load", () => {
    expect(e!.hold.loadFactor).toBeLessThanOrEqual(e!.baselineLoad + 1e-9);
  });
  it("matching keeps at least as much load as holding", () => {
    expect(e!.match.loadFactor).toBeGreaterThanOrEqual(e!.hold.loadFactor - 1e-9);
  });
  it("matching the cut lowers profit versus before the cut", () => {
    expect(e!.match.profitDelta).toBeLessThan(0);
  });
  it("is deterministic", () => {
    expect(fareCutEffects(route, DAY, 10, true)).toEqual(e);
  });
  it("returns null for an unknown aircraft type", () => {
    expect(fareCutEffects({ ...route, typeId: "NOPE" }, DAY, 10, true)).toBeNull();
  });
  it("formats an estimate with sign and load", () => {
    expect(effectText({ profitDelta: -120000, loadFactor: 0.613 })).toMatch(/^est\. .*\/wk, load 61%$/);
  });
});
