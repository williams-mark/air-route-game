import type { Entry } from "./schema.js";

// Provenance for every row: SOURCES.md, "Aircraft". Add new variants below the existing ones; keep ids unique across all files.
const entry: Entry = {
  rows: [
    ["DC10-30", "Douglas", "McDonnell Douglas DC-10-30", 9600, 876, 380, 6.3, 3200, 120, 1972, 1988, true],
  ],
  family: {
      "DC10-30": "DC-10"
  },
  visual: {},
};

export default entry;
