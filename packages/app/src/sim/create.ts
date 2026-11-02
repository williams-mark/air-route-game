import { seedRoutes } from "../routes/seed";
import { MockSimBridge, type SimBridge } from "./bridge";
import { RealSimBridge } from "./realBridge";

export type StartableBridge = SimBridge & { start?: () => void };

/**
 * The real simulation is the default. `?mock=1` selects the scripted mock (tests, screenshots of fixtures);
 * `?seed=N` seeds the real sim (default 2015); `?paused` starts at speed 0.
 */
export function createBridge(search: string = typeof location !== "undefined" ? location.search : ""): StartableBridge {
  const q = new URLSearchParams(search);
  const startPaused = q.has("paused");
  if (q.get("mock") === "1") {
    const b = new MockSimBridge({ startPaused, routes: seedRoutes() });
    b.start();
    return b;
  }
  const seed = Number(q.get("seed"));
  const b = new RealSimBridge({ seed: q.has("seed") && Number.isFinite(seed) ? seed : 2015, startPaused });
  b.start();
  return b;
}
