import type { CameraPresetId } from "./types";

/** [west, south, east, north] */
export const PRESET_BOUNDS: Record<CameraPresetId, [number, number, number, number]> = {
  california: [-124.6, 32.3, -114.0, 42.1],
  northwest: [-125.0, 41.9, -116.4, 49.2],
  hawaii: [-160.6, 18.7, -154.6, 22.4],
  both: [-161.5, 18.2, -113.0, 49.3],
};
export const PRESET_LABEL: Record<CameraPresetId, string> = { california: "California", northwest: "Oregon/Washington", hawaii: "Hawaii", both: "All" };
