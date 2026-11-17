import { describe, expect, it } from "vitest";
import { aircraftTypes } from "./index";

describe("A300 seat limits", () => {
  it("variants that share one fuselage share one certified maximum", () => {
    const seats = (id: string) => aircraftTypes.find((t) => t.id === id)!.maxSeats;
    // B2 and B4 share the 53.61 m fuselage and door layout; the -600 and -600R share the A310-style rear fuselage.
    expect(new Set(["A300B2", "A300B4-100", "A300B4-200"].map(seats))).toEqual(new Set([345]));
    expect(new Set(["A300-600", "A300-600R"].map(seats))).toEqual(new Set([345]));
  });
});
