import { describe, expect, it } from "vitest";
import { aircraftTypes } from "@arg/data";
import { typeLabel, typeShortName } from "./names";

describe("typeShortName", () => {
  const byId = (id: string) => aircraftTypes.find((t) => t.id === id)!;

  it("gives the same short name for every view", () => {
    expect(typeShortName(byId("B737-800"))).toBe("B737-800");
    expect(typeShortName(byId("A321"))).toBe("A321ceo");
    expect(typeShortName(byId("A320N"))).toBe("A320neo");
    expect(typeShortName(byId("E175"))).toBe("E175");
    expect(typeShortName(byId("DC10-30"))).toBe("DC-10-30");
  });

  it("keeps the B prefix only for Boeing types and never repeats the maker", () => {
    for (const t of aircraftTypes) {
      const s = typeShortName(t);
      expect(s).not.toMatch(/^(Airbus|Boeing|Embraer|Bombardier|McDonnell)/);
      if (t.manufacturer === "Boeing") expect(s.startsWith("B")).toBe(true);
    }
  });

  it("falls back to the id for an unknown type", () => {
    expect(typeLabel(aircraftTypes, "NOPE")).toBe("NOPE");
    expect(typeLabel(aircraftTypes, "A321")).toBe("A321ceo");
  });
});
