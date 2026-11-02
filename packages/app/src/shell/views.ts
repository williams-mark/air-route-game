import type { ComponentType } from "react";
import type { ViewId } from "../store";
import { IconFinance, IconFleet, IconCabin, IconMap, IconOrders, IconRoutes, IconSettings } from "./icons";

export const VIEWS: Array<{ id: ViewId; label: string; Icon: ComponentType<{ size?: number }> }> = [
  { id: "map", label: "Map", Icon: IconMap },
  { id: "routes", label: "Routes", Icon: IconRoutes },
  { id: "fleet", label: "Fleet", Icon: IconFleet },
  { id: "orders", label: "Orders / Offers", Icon: IconOrders },
  { id: "finance", label: "Finance", Icon: IconFinance },
  { id: "settings", label: "Settings", Icon: IconSettings },
  { id: "cabin", label: "Cabin designer", Icon: IconCabin },
];
