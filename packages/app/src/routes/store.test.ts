import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The app store touches the DOM on load (theme, scale); stub just enough for a node test.
type Store = typeof import("./store");
type Sim = typeof import("../sim/useSim");
let useCreation: Store["useCreation"];
let bridge: Sim["bridge"];

beforeAll(async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {}, style: { setProperty() {} } }, body: {} });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} });
  ({ useCreation } = await import("./store"));
  ({ bridge } = await import("../sim/useSim"));
});

describe("route sandbox", () => {
  beforeEach(() => {
    useCreation.getState().end(false);
    bridge.setSpeed(0);
  });

  it("pauses the clock on open and restores the prior speed on close", () => {
    bridge.setSpeed(3);
    useCreation.getState().begin();
    expect(useCreation.getState().open).toBe(true);
    expect(useCreation.getState().prevSpeed).toBe(3);
    expect(bridge.getState().speed).toBe(0);
    useCreation.getState().end();
    expect(useCreation.getState().open).toBe(false);
    expect(bridge.getState().speed).toBe(3);
  });

  it("leaves the clock paused when the game was already paused", () => {
    useCreation.getState().begin();
    useCreation.getState().end();
    expect(bridge.getState().speed).toBe(0);
  });
});
