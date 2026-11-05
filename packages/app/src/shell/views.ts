import type { ComponentType } from "react";
import type { ViewId } from "../store";
import { IconFinance, IconFleet, IconPlanner, IconCabin, IconMap, IconOrders, IconRoutes, IconSettings, IconRivals, IconHubBoard } from "./icons";

export const VIEWS: Array<{ id: ViewId; label: string; Icon: ComponentType<{ size?: number }> }> = [
  { id: "map", label: "Map", Icon: IconMap },
  { id: "routes", label: "Routes", Icon: IconRoutes },
  { id: "fleet", label: "Fleet", Icon: IconFleet },
  { id: "planner", label: "Planner", Icon: IconPlanner },
  { id: "orders", label: "Orders / Offers", Icon: IconOrders },
  { id: "finance", label: "Finance", Icon: IconFinance },
  { id: "rivals", label: "Rivals", Icon: IconRivals },
  { id: "settings", label: "Settings", Icon: IconSettings },
  { id: "cabin", label: "Cabin designer", Icon: IconCabin },
  { id: "hubboard", label: "Hub board", Icon: IconHubBoard },
];

/** Key of the Alt shortcut for the view at `index`: 1-9, then 0 for the tenth. */
export const viewKey = (index: number): string => (index === 9 ? "0" : String(index + 1));
/** Index of the view an Alt+key press selects, or -1. */
export const viewIndexForKey = (key: string): number => (/^[0-9]$/.test(key) ? (key === "0" ? 9 : Number(key) - 1) : -1);
