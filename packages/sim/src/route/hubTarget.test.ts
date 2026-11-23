import { describe, expect, it } from "vitest";
import { airports, aircraftTypes } from "@arg/data";
import { applyCommand, runDays, startingScenario } from "../index";

// Owner, 22 Nov 2026: "If a fare policy is set at 85% that does not mean as long as it is at least 85% the route is okay, fares should
// rise until load factor ... falls to the target". Before the fix, LAX-SFO and LAX-SAN sat at 100% for months under an 85% policy:
// the solve priced local passengers to 85% and hub connecting passengers filled the rest.
describe("fare policy target on hub routes with connecting traffic", () => {
  it("brings every starting route to about the target, not 100%", () => {
    let s = startingScenario(airports, aircraftTypes, 2015, { rivalField: "world" });
    s = applyCommand(s, { kind: "setFarePolicy", policy: { id: "p1", name: "All", targetLoadFactor: 0.85, connectionMarkdown: 0, scope: "all" } }).state;
    // Average over a month once the controller has settled (about two months).
    s = runDays(s, 120);
    const sums: Record<string, number> = {};
    for (let d = 0; d < 28; d++) {
      s = runDays(s, 1);
      for (const r of s.world.routes) sums[r.id] = (sums[r.id] ?? 0) + (s.routeReports[r.id]?.evaluation.loadFactor ?? 0) / 28;
    }
    for (const r of s.world.routes) {
      const lf = sums[r.id]!;
      expect(lf, `${r.origin}-${r.destination}`).toBeLessThan(0.9);
      expect(lf, `${r.origin}-${r.destination}`).toBeGreaterThan(0.75);
    }
  }, 300_000);
});
