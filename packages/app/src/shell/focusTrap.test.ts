import { describe, expect, it } from "vitest";
import { trapIndex } from "./focusTrap";

describe("trapIndex (Tab and Shift+Tab inside a modal)", () => {
  it("wraps from the last control to the first on Tab", () => {
    expect(trapIndex(4, 3, false)).toBe(0);
  });
  it("wraps from the first control to the last on Shift+Tab", () => {
    expect(trapIndex(4, 0, true)).toBe(3);
  });
  it("lets the browser move focus in the middle of the dialog", () => {
    expect(trapIndex(4, 1, false)).toBeNull();
    expect(trapIndex(4, 2, true)).toBeNull();
  });
  it("pulls stray focus back in", () => {
    expect(trapIndex(4, -1, false)).toBe(0);
    expect(trapIndex(4, -1, true)).toBe(3);
  });
  it("a single control keeps focus on itself", () => {
    expect(trapIndex(1, 0, false)).toBe(0);
    expect(trapIndex(1, 0, true)).toBe(0);
  });
  it("with nothing tabbable the dialog itself keeps focus", () => {
    expect(trapIndex(0, -1, false)).toBe(-1);
    expect(trapIndex(0, -1, true)).toBe(-1);
  });
});
