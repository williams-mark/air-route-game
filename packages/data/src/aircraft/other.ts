import type { Entry } from "./schema.js";

// Provenance for every row: SOURCES.md, "Aircraft". Add new variants below the existing ones; keep ids unique across all files.
const entry: Entry = {
  rows: [
    ["E175", "Embraer", "Embraer E175", 4074, 800, 88, 1.8, 2244, 42, 2005, null, false],
    ["CRJ700", "Bombardier", "Bombardier CRJ-700", 3763, 828, 78, 1.6, 1600, 41, 2001, 2020, false],
    ["CRJ900", "Bombardier", "Bombardier CRJ-900", 2950, 828, 90, 1.8, 1770, 48, 2003, 2021, false],
    ["ATR72-600", "ATR", "ATR 72-600", 1404, 510, 78, 1.3, 1279, 26.8, 2011, null, false],
  ],
  family: {
      "E175": "E-Jet",
      "CRJ700": "CRJ family",
      "CRJ900": "CRJ family",
      "ATR72-600": "ATR 72"
  },
  visual: {},
};

export default entry;
