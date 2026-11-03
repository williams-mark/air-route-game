import { aircraftTypes } from "@arg/data";
import { familyOf, FAMILY_ORDER } from "../aircraft/families";
import type { FleetItem } from "../sim/bridge";

export type FleetSortKey = "default" | "type" | "status" | "tail" | "age";
export type SortDir = "asc" | "desc";
export const FLEET_SORT_KEYS: readonly { key: FleetSortKey; label: string }[] = [
  { key: "default", label: "Needs attention" },
  { key: "type", label: "Aircraft type" },
  { key: "status", label: "Status" },
  { key: "tail", label: "Tail" },
  { key: "age", label: "Age" },
];

/** Active first, then the rest in operational order. */
export const STATUS_RANK = { active: 0, maintenance: 1, delivery: 2, stored: 3 } as const;
/** Original order of the view: aircraft in the hangar first. */
const ATTENTION_RANK = { maintenance: 0, active: 1, delivery: 2, stored: 3 } as const;

const typeById = new Map(aircraftTypes.map((t) => [t.id, t]));
const famRank = (f: string) => { const i = FAMILY_ORDER.indexOf(f); return i < 0 ? 999 : i; };

const byTail = (x: FleetItem, y: FleetItem) => x.tail.localeCompare(y.tail, "en", { numeric: true });

/** Manufacturer, then family (display order), then type name (numeric aware), then tail. */
export function compareByType(x: FleetItem, y: FleetItem): number {
  const tx = typeById.get(x.typeId), ty = typeById.get(y.typeId);
  if (!tx !== !ty) return tx ? -1 : 1; // unknown types last
  const mx = tx?.manufacturer ?? "", my = ty?.manufacturer ?? "";
  if (mx !== my) return mx.localeCompare(my, "en");
  const fx = tx ? familyOf(tx) : x.typeName, fy = ty ? familyOf(ty) : y.typeName;
  if (fx !== fy) return famRank(fx) - famRank(fy) || fx.localeCompare(fy, "en");
  return x.typeName.localeCompare(y.typeName, "en", { numeric: true }) || byTail(x, y);
}

/** Active, in check/refit, on order, stored; ties by type then tail. */
export function compareByStatus(x: FleetItem, y: FleetItem): number {
  return STATUS_RANK[x.status] - STATUS_RANK[y.status] || compareByType(x, y);
}

export function compareFleet(key: FleetSortKey): (x: FleetItem, y: FleetItem) => number {
  switch (key) {
    case "type": return compareByType;
    case "status": return compareByStatus;
    case "tail": return byTail;
    case "age": return (x, y) => x.ageYears - y.ageYears || byTail(x, y);
    default: return (x, y) => ATTENTION_RANK[x.status] - ATTENTION_RANK[y.status] || x.typeId.localeCompare(y.typeId) || x.tail.localeCompare(y.tail);
  }
}

export function sortFleet(fleet: readonly FleetItem[], key: FleetSortKey, dir: SortDir): FleetItem[] {
  const cmp = compareFleet(key);
  const s = dir === "asc" ? 1 : -1;
  return [...fleet].sort((x, y) => s * cmp(x, y));
}

/** Group heading shown between cards for the type and status sorts (null = no grouping). */
export function groupLabel(a: FleetItem, key: FleetSortKey): string | null {
  if (key === "type") { const t = typeById.get(a.typeId); return t ? `${t.manufacturer} ${familyOf(t)}` : a.typeName; }
  if (key === "status") return ({ active: "Active", maintenance: "Maintenance / refit", delivery: "On order", stored: "Stored" })[a.status];
  return null;
}
