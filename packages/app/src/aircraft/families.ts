import type { AircraftType } from "@arg/contracts";

/** Family of every type id in @arg/data. Pure lookup; a test checks that every data id is listed here. */
export const FAMILY_BY_ID: Readonly<Record<string, string>> = {
  "B737-700": "737 NG", "B737-800": "737 NG", "B737-900ER": "737 NG",
  "B737-8": "737 MAX", "B737-9": "737 MAX",
  "B757-200": "757", "B767-300ER": "767",
  "B777-200ER": "777", "B777-300ER": "777",
  "B787-8": "787", "B787-9": "787", "B787-10": "787",
  "B747-400": "747",
  "B707-120": "707",
  "B707-120B": "707",
  "B707-320": "707",
  "B707-420": "707",
  "B707-320B": "707",
  "B707-320C": "707",
  "B720": "707",
  "B720B": "707",
  "B717-200": "717",
  "B727-100": "727",
  "B727-100C": "727",
  "B727-200": "727",
  "B727-200ADV": "727",
  "B737-100": "737 Original",
  "B737-200": "737 Original",
  "B737-200ADV": "737 Original",
  "B737-300": "737 Classic",
  "B737-400": "737 Classic",
  "B737-500": "737 Classic",
  "B747-100": "747",
  "B747-200B": "747",
  "B747-300": "747",
  "B747SP": "747",
  "B747-400ER": "747",
  "B757-300": "757",
  "B767-200": "767",
  "B767-200ER": "767",
  "B767-300": "767",
  "B767-400ER": "767",
  "B777-200": "777",
  "B777-200LR": "777",
  "B777-300": "777",
  "B737-600": "737 NG",
  "DC10-30": "DC-10",
  "A319": "A320 family", "A320": "A320 family", "A321": "A320 family", "A320N": "A320 family", "A321N": "A320 family",
  "A220-100": "A220", "A220-300": "A220",
  "A330-200": "A330", "A330-300": "A330", "A330-900": "A330",
  "A350-900": "A350", "A350-1000": "A350",
  "E175": "E-Jet",
  "CRJ700": "CRJ family", "CRJ900": "CRJ family",
  "ATR72-600": "ATR 72",
};

/** Display order of families inside a manufacturer (unlisted families sort after, alphabetically). */
export const FAMILY_ORDER: readonly string[] = ["A220", "A320 family", "A330", "A350", "707", "717", "727", "737 Original", "737 Classic", "737 NG", "737 MAX", "757", "767", "777", "787", "747", "DC-10", "CRJ family", "E-Jet", "ATR 72"];

/** The family tile an aircraft type belongs to. Falls back to the type's own name for ids not in the table. */
export function familyOf(type: Pick<AircraftType, "id" | "name">): string {
  return FAMILY_BY_ID[type.id] ?? type.name;
}

export interface FamilyNode { family: string; types: AircraftType[] }
export interface ManufacturerNode { manufacturer: string; families: FamilyNode[] }

const famRank = (f: string) => { const i = FAMILY_ORDER.indexOf(f); return i < 0 ? 999 : i; };

/** manufacturer -> family -> variants (variants by seats, then name). */
export function buildTree(types: readonly AircraftType[]): ManufacturerNode[] {
  const byMan = new Map<string, Map<string, AircraftType[]>>();
  for (const t of types) {
    const fams = byMan.get(t.manufacturer) ?? new Map<string, AircraftType[]>();
    const fam = familyOf(t);
    fams.set(fam, [...(fams.get(fam) ?? []), t]);
    byMan.set(t.manufacturer, fams);
  }
  return [...byMan]
    .map(([manufacturer, fams]) => ({
      manufacturer,
      families: [...fams]
        .map(([family, ts]) => ({ family, types: [...ts].sort((a, b) => a.maxSeats - b.maxSeats || a.name.localeCompare(b.name)) }))
        .sort((a, b) => famRank(a.family) - famRank(b.family) || a.family.localeCompare(b.family)),
    }))
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer));
}

/** Where a type sits in the tree: [manufacturer, family]. */
export const pathOf = (t: AircraftType): [string, string] => [t.manufacturer, familyOf(t)];
