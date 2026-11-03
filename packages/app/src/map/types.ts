import type { Route } from "@arg/contracts";

export type ProfitTier = "profit" | "marginal" | "loss" | "planned";
export type Theme = "dark" | "light";
export type CameraPresetId = "west" | "us" | "europe" | "alaska" | "hawaii" | "world";

/** A contract Route plus the display-only profit tier (the sim will supply it later). */
export interface MapRoute extends Route {
  tier: ProfitTier;
  weeklyProfitUsd?: number;
}

export type Rgba = [number, number, number, number];
