import { describe, expect, it } from "vitest";
import type { Airport, FarePolicy, Route } from "@arg/contracts";
import { blankDraft, coverage, draftFromPolicy, draftToPolicy, filterRoutes, moveBy, newPolicyId, reorderPlan, scopeText, withPolicy } from "./policy";

const ap = (id: string, lat: number, lon: number, country = "US"): Airport => ({ id, lat, lon, country }) as unknown as Airport;
const airports = [ap("LAX", 33.94, -118.41), ap("SFO", 37.62, -122.38), ap("JFK", 40.64, -73.78), ap("LHR", 51.47, -0.45, "GB")];
const route = (id: string, o: string, d: string, targetLoadFactor?: number): Route => ({ id, origin: o, destination: d, ...(targetLoadFactor !== undefined ? { targetLoadFactor } : {}) }) as unknown as Route;
const routes = [route("r1", "LAX", "SFO"), route("r2", "LAX", "JFK"), route("r3", "JFK", "LHR"), route("r4", "SFO", "JFK", 0.9)];
const pol = (id: string, target: number | null, scope: FarePolicy["scope"], name = id): FarePolicy => ({ id, name, targetLoadFactor: target, connectionMarkdown: 0.1, scope });

describe("fare policy drafts", () => {
  it("round-trips a policy through a draft", () => {
    const p = pol("fp-1", 0.8, { categories: ["short"], routeIds: ["r2"] }, "Short + r2");
    const back = draftToPolicy(draftFromPolicy(p), new Set(["r1", "r2"]));
    expect(back).toEqual({ ok: true, policy: p });
  });
  it("validates name, scope and drops closed routes", () => {
    const d = blankDraft([]);
    expect(draftToPolicy(d, new Set()).ok).toBe(false);
    expect(draftToPolicy({ ...d, name: "x", all: false }, new Set())).toMatchObject({ ok: false });
    expect(draftToPolicy({ ...d, name: "x", all: false, routeIds: ["gone"] }, new Set(["r1"])).ok).toBe(false);
    expect(draftToPolicy({ ...d, name: " x ", all: false, routeIds: ["gone", "r1"] }, new Set(["r1"]))).toMatchObject({ ok: true, policy: { name: "x", scope: { routeIds: ["r1"] } } });
  });
  it("clamps percentages and supports target off", () => {
    const r = draftToPolicy({ ...blankDraft([]), name: "n", targetPct: 120, markdownPct: 80 }, new Set());
    expect(r).toMatchObject({ ok: true, policy: { targetLoadFactor: 0.95, connectionMarkdown: 0.5 } });
    expect(draftToPolicy({ ...blankDraft([]), name: "n", targetOn: false }, new Set())).toMatchObject({ ok: true, policy: { targetLoadFactor: null } });
  });
  it("makes unique ids and describes scopes", () => {
    expect(newPolicyId([])).toBe("fp-1");
    expect(newPolicyId([{ id: "fp-2" }])).toBe("fp-3");
    expect(newPolicyId([{ id: "fp-2" }, { id: "fp-3" }])).toBe("fp-4");
    expect(scopeText(pol("a", null, "all"))).toBe("All routes");
    expect(scopeText(pol("a", null, { categories: ["short", "international"], routeIds: ["x"] }))).toBe("Short, International + 1 route");
  });
});

describe("coverage", () => {
  const policies = [pol("a", 0.7, "all", "Everything"), pol("b", 0.85, { categories: ["international"] }, "Intl"), pol("c", null, { routeIds: ["r1"] }, "Off r1")];
  const rows = coverage(policies, routes, airports, ["LAX"]);
  const by = (id: string) => rows.find((r) => r.routeId === id)!;
  it("later policies override earlier ones, null turns the target off", () => {
    expect(by("r2")).toMatchObject({ target: 0.7, source: { kind: "policy", policyId: "a" }, covering: ["a"] });
    expect(by("r3")).toMatchObject({ target: 0.85, source: { kind: "policy", policyId: "b" }, covering: ["a", "b"] });
    expect(by("r1")).toMatchObject({ target: undefined, source: { kind: "policy", policyId: "c" }, covering: ["a", "c"] });
  });
  it("route-level target overrides every policy", () => {
    expect(by("r4")).toMatchObject({ target: 0.9, source: { kind: "route" }, covering: ["a"] });
  });
  it("reports categories and no policy", () => {
    expect(by("r3").categories).toContain("international");
    expect(coverage([], routes, airports, []).every((r) => r.source.kind === "none" && r.target === undefined || r.source.kind === "route")).toBe(true);
  });
});

describe("ordering", () => {
  const a = pol("a", 0.7, "all"), b = pol("b", 0.8, "all"), c = pol("c", 0.9, "all");
  it("moves by one and ignores out-of-range moves", () => {
    expect(moveBy([a, b, c], 1, -1).map((p) => p.id)).toEqual(["b", "a", "c"]);
    expect(moveBy([a, b, c], 2, 1).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(moveBy([a, b, c], 0, -1).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("plans remove and re-add of the changed tail", () => {
    expect(reorderPlan([a, b, c], [a, c, b])).toEqual({ remove: ["b", "c"], add: [c, b] });
    expect(reorderPlan([a, b, c], [b, a, c])).toEqual({ remove: ["a", "b", "c"], add: [b, a, c] });
    expect(reorderPlan([a, b], [a, b])).toEqual({ remove: [], add: [] });
  });
  it("replaces in place or appends", () => {
    expect(withPolicy([a, b], { ...a, name: "A2" }).map((p) => p.name)).toEqual(["A2", "b"]);
    expect(withPolicy([a], b).map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("filters routes by name", () => {
    expect(filterRoutes(routes, "lax").map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(filterRoutes(routes, "jfk-lhr").map((r) => r.id)).toEqual(["r3"]);
    expect(filterRoutes(routes, "").length).toBe(4);
  });
});
