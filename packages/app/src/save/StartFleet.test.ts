import { describe, expect, it } from "vitest";
import { prunePicks, setCount } from "./StartFleet";

describe("start fleet picks", () => {
  it("setCount adds, changes in place and removes at zero", () => {
    let p = setCount([], "A320", 1);
    p = setCount(p, "B737-800", 2);
    p = setCount(p, "A320", 3);
    expect(p).toEqual([["A320", 3], ["B737-800", 2]]);
    expect(setCount(p, "A320", 0)).toEqual([["B737-800", 2]]);
  });
  it("prunePicks drops types not in service in the start year", () => {
    expect(prunePicks([["B787-10", 1], ["B737-800", 2]], 2015)).toEqual([["B737-800", 2]]);
  });
});
