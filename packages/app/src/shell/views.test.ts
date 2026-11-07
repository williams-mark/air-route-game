import { describe, expect, it } from "vitest";
import { VIEWS, viewForKey, viewShortcut } from "./views";

describe("views and shortcuts", () => {
  it("puts Hubs and Fare policy right after Fleet", () => {
    const ids = VIEWS.map((v) => v.id);
    expect(ids.slice(ids.indexOf("fleet"), ids.indexOf("fleet") + 3)).toEqual(["fleet", "hubs", "farepolicy"]);
  });
  it("keeps every shortcut unique and the old digit keys on their views", () => {
    const keys = VIEWS.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(viewForKey({ key: "0" })?.id).toBe("hubboard");
    expect(viewForKey({ key: "3" })?.id).toBe("fleet");
    // The planner is retired behind PLANNER_ENABLED, so its old key does nothing.
    expect(viewForKey({ key: "4" })).toBeUndefined();
  });
  it("selects the new views by key or by physical code", () => {
    expect(viewForKey({ key: "-" })?.id).toBe("hubs");
    expect(viewForKey({ key: "≠", code: "Equal" })?.id).toBe("farepolicy");
    expect(viewForKey({ key: "x", code: "KeyX" })).toBeUndefined();
    expect(viewShortcut(VIEWS.find((v) => v.id === "hubs")!)).toBe("Alt+-");
  });
});
