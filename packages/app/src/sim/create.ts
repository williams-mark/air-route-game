import { seedRoutes } from "../routes/seed";
import { MockSimBridge, type SimBridge } from "./bridge";
import { aircraftTypes, airports } from "@arg/data";
import { plannerDemoFleet } from "@arg/sim";
import { RealSimBridge } from "./realBridge";
import { startScreenWanted } from "../save/saves";

export type StartableBridge = SimBridge & { start?: () => void };

/**
 * The real simulation is the default. `?mock=1` selects the scripted mock (tests, screenshots of fixtures);
 * `?seed=N` seeds the real sim (default 2015); `?paused` starts at speed 0; `?ff=N` fast-forwards N days at load (screenshots).
 */
export function createBridge(search: string = typeof location !== "undefined" ? location.search : ""): StartableBridge {
  const q = new URLSearchParams(search);
  // While the start screen is up the game is held at speed 0; choosing New game / Continue starts it.
  const startPaused = q.has("paused") || (q.get("mock") !== "1" && startScreenWanted(search));
  if (q.get("mock") === "1") {
    const b = new MockSimBridge({ startPaused, routes: seedRoutes() });
    b.start();
    return b;
  }
  const seed = Number(q.get("seed"));
  const s0 = q.has("seed") && Number.isFinite(seed) ? seed : 2015;
  // ?fleetdemo: a 35-aircraft test fleet with 10+ routes for the fleet planner (screenshots, QA).
  const b = new RealSimBridge({ seed: s0, startPaused, ...(q.has("fleetdemo") ? { initial: plannerDemoFleet(airports, aircraftTypes, s0) } : {}) });
  const ff = Number(q.get("ff"));
  if (ff > 0) b.stepDays(Math.min(ff, 3650));
  b.start();
  return b;
}
