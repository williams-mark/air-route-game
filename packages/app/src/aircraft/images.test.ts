import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aircraftTypes } from "@arg/data";
import { AIRCRAFT_DRAWINGS, aircraftImageUrl } from "./images";

const pub = join(__dirname, "../../public/aircraft");

describe("aircraft side-view drawings", () => {
  it("every aircraft type has a drawing on disk", () => {
    const missing = aircraftTypes.filter((t) => !AIRCRAFT_DRAWINGS.has(t.id) || !existsSync(join(pub, `${t.id}.svg`))).map((t) => t.id);
    expect(missing).toEqual([]);
  });
  it("drawings are standalone SVG with a title", () => {
    for (const id of AIRCRAFT_DRAWINGS) {
      const svg = readFileSync(join(pub, `${id}.svg`), "utf8");
      expect(svg.startsWith("<svg"), id).toBe(true);
      expect(svg.includes("<title>"), id).toBe(true);
      expect(/<script|href="http/.test(svg), id).toBe(false);
    }
  });
  it("builds URLs under the base path", () => {
    expect(aircraftImageUrl("B737-800", "/game/")).toBe("/game/aircraft/B737-800.svg");
    expect(aircraftImageUrl("NOPE", "/")).toBeNull();
  });
});
