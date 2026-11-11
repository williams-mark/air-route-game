import type { AircraftType } from "@arg/contracts";
import { aircraftFamilyById } from "@arg/data";

/** The family tile a type belongs to, from @arg/data. Falls back to the type's own name for ids without one. */
export function familyOf(type: Pick<AircraftType, "id" | "name">, table: Readonly<Record<string, string>> = aircraftFamilyById): string {
  return table[type.id] ?? type.name;
}

export const OTHERS = "Others";
export const DOUGLAS_GROUP = "Douglas / McDonnell Douglas";
const MAJORS = new Set(["Boeing", "Airbus", DOUGLAS_GROUP]);

/** Manufacturer tile a maker belongs to: Boeing, Airbus, the Douglas lineage merged, everything else under "Others". */
export function manufacturerGroup(manufacturer: string): string {
  if (/douglas/i.test(manufacturer)) return DOUGLAS_GROUP;
  return MAJORS.has(manufacturer) ? manufacturer : OTHERS;
}

export interface FamilyNode { family: string; manufacturer: string; types: AircraftType[] }
export interface ManufacturerNode { manufacturer: string; families: FamilyNode[] }

/** "DC-10" -> ["DC", 10]; "737" -> ["", 737]; "A320 family" -> ["A", 320]. Names without a number sort after, by name. */
function familyKey(name: string): [string, number] {
  const m = /^([A-Za-z]*)[\s-]*(\d+)/.exec(name);
  return m ? [m[1]!.toUpperCase(), Number(m[2])] : [name.toUpperCase(), Number.POSITIVE_INFINITY];
}
/** Numeric/alphabetic order: 707 717 727 737 747; A220 A300 A320; DC-9 DC-10 MD-80. */
export function compareFamilies(a: string, b: string): number {
  const [pa, na] = familyKey(a), [pb, nb] = familyKey(b);
  return pa.localeCompare(pb) || na - nb || a.localeCompare(b);
}

/** manufacturer group -> family -> variants. Groups by type count (most first, Others last); families numerically; variants by seats. */
export function buildTree(types: readonly AircraftType[], table: Readonly<Record<string, string>> = aircraftFamilyById): ManufacturerNode[] {
  const groups = new Map<string, Map<string, FamilyNode>>();
  for (const t of types) {
    const g = manufacturerGroup(t.manufacturer);
    const fams = groups.get(g) ?? new Map<string, FamilyNode>();
    const family = familyOf(t, table);
    const key = g === OTHERS ? `${t.manufacturer}|${family}` : family;
    const node = fams.get(key) ?? { family, manufacturer: t.manufacturer, types: [] };
    node.types.push(t);
    fams.set(key, node);
    groups.set(g, fams);
  }
  const count = (m: ManufacturerNode) => m.families.reduce((s, f) => s + f.types.length, 0);
  return [...groups]
    .map(([manufacturer, fams]) => ({
      manufacturer,
      families: [...fams.values()]
        .map((f) => ({ ...f, types: [...f.types].sort((a, b) => a.maxSeats - b.maxSeats || a.name.localeCompare(b.name)) }))
        .sort((a, b) => (manufacturer === OTHERS ? a.manufacturer.localeCompare(b.manufacturer) : 0) || compareFamilies(a.family, b.family)),
    }))
    .sort((a, b) => (a.manufacturer === OTHERS ? 1 : 0) - (b.manufacturer === OTHERS ? 1 : 0) || count(b) - count(a) || a.manufacturer.localeCompare(b.manufacturer));
}

/** Where a type sits in the tree: [manufacturer tile, family]. */
export const pathOf = (t: AircraftType, table?: Readonly<Record<string, string>>): [string, string] => [manufacturerGroup(t.manufacturer), familyOf(t, table)];
