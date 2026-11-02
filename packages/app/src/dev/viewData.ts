// DEV-ONLY fixture data for placeholder views. Not sourced data; never treat as real figures.
import type { Aircraft } from "@arg/contracts";
import { fixtureRoutes } from "./fixtures";

export interface RouteRow { id: string; route: string; aircraft: string; freq: number; loadFactor: number; weeklyProfit: number; tier: string }
export const routeRows: RouteRow[] = fixtureRoutes.map((r, i) => {
  const lf = r.tier === "profit" ? 0.82 + ((i * 7) % 11) / 100 : r.tier === "marginal" ? 0.72 + ((i * 5) % 8) / 100 : r.tier === "loss" ? 0.5 + ((i * 3) % 12) / 100 : 0;
  return { id: r.id, route: `${r.origin} → ${r.destination}`, aircraft: r.typeId, freq: r.weeklyFrequency, loadFactor: lf, weeklyProfit: r.weeklyProfitUsd ?? 0, tier: r.tier };
});

export interface FleetRow { tail: string; type: string; status: Aircraft["status"]; ageYears: number; assignment: string }
const statuses: Aircraft["status"][] = ["active", "active", "active", "maintenance", "active", "delivery", "active", "stored", "active", "active"];
export const fleetRows: FleetRow[] = statuses.map((status, i) => ({
  tail: `N${510 + i * 7}SP`, type: i % 3 === 0 ? "A320-200" : "B737-800", status, ageYears: 2 + ((i * 3) % 9),
  assignment: status === "active" ? (fixtureRoutes[i * 3 % fixtureRoutes.length]?.id.replace("-", " → ") ?? "") : status === "maintenance" ? "C-check, LAX" : status === "delivery" ? "Delivery Mar 2015" : "Stored, VCV",
}));

export interface MonthRow { month: string; revenue: number; fuel: number; crew: number; maintenance: number; fees: number; other: number }
const base = [10.2, 9.6, 11.4, 12.1, 13.0, 14.8, 15.9, 15.6, 13.3, 12.4, 11.8, 14.2];
export const monthRows: MonthRow[] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => {
  const rev = base[i]! * 1e6;
  const f = 1 + ((i * 37) % 7) / 50;
  return { month: m, revenue: rev, fuel: rev * 0.27 * f, crew: rev * 0.21, maintenance: rev * 0.11, fees: rev * 0.16, other: rev * 0.2 * (1 + (i % 3) / 10) };
});
export const profitOf = (m: MonthRow) => m.revenue - m.fuel - m.crew - m.maintenance - m.fees - m.other;
