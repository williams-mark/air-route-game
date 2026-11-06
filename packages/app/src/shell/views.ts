import type { ComponentType } from "react";
import type { ViewId } from "../store";
import { IconFinance, IconFleet, IconPlanner, IconCabin, IconMap, IconOrders, IconRoutes, IconSettings, IconRivals, IconHubBoard, IconHubs, IconFarePolicy } from "./icons";

export const VIEWS: Array<{ id: ViewId; label: string; Icon: ComponentType<{ size?: number }>; /** Alt shortcut key (KeyboardEvent.key). */ key: string; code?: string }> = [
  { id: "map", label: "Map", Icon: IconMap, key: "1" },
  { id: "routes", label: "Routes", Icon: IconRoutes, key: "2" },
  { id: "fleet", label: "Fleet", Icon: IconFleet, key: "3" },
  { id: "hubs", label: "Hubs", Icon: IconHubs, key: "-", code: "Minus" },
  { id: "farepolicy", label: "Fare policy", Icon: IconFarePolicy, key: "=", code: "Equal" },
  { id: "planner", label: "Planner", Icon: IconPlanner, key: "4" },
  { id: "orders", label: "Orders / Offers", Icon: IconOrders, key: "5" },
  { id: "finance", label: "Finance", Icon: IconFinance, key: "6" },
  { id: "rivals", label: "Rivals", Icon: IconRivals, key: "7" },
  { id: "settings", label: "Settings", Icon: IconSettings, key: "8" },
  { id: "cabin", label: "Cabin designer", Icon: IconCabin, key: "9" },
  { id: "hubboard", label: "Hub board", Icon: IconHubBoard, key: "0" },
];

/** Text of a view's Alt shortcut, e.g. "Alt+3". */
export const viewShortcut = (v: { key: string }): string => `Alt+${v.key}`;
/** The view an Alt+key press selects (by key, or by physical code for punctuation keys), or undefined. */
export function viewForKey(e: { key: string; code?: string }): (typeof VIEWS)[number] | undefined {
  return VIEWS.find((v) => v.key === e.key || (v.code !== undefined && v.code === e.code));
}
