import type { Entry } from "./schema.js";

// Provenance for every row: SOURCES.md, "Aircraft". Add new variants below the existing ones; keep ids unique across all files.
const entry: Entry = {
  rows: [
    ["B737-700", "Boeing", "Boeing 737-700", 5570, 840, 149, 2.6, 2042, 89, 1997, 2019, false],
    ["B737-800", "Boeing", "Boeing 737-800", 5436, 840, 189, 2.9, 2316, 106, 1998, 2019, false],
    ["B737-900ER", "Boeing", "Boeing 737-900ER", 5460, 840, 220, 3.1, 3000, 112, 2007, 2019, false],
    ["B737-8", "Boeing", "Boeing 737 MAX 8", 6500, 840, 210, 2.5, 2500, 122, 2017, null, false],
    ["B737-9", "Boeing", "Boeing 737 MAX 9", 6100, 840, 220, 2.6, 2600, 129, 2018, null, false],
    ["B757-200", "Boeing", "Boeing 757-200", 7250, 858, 239, 3.8, 2070, 80, 1983, 2004, false],
    ["B767-300ER", "Boeing", "Boeing 767-300ER", 11070, 850, 351, 6.2, 2650, 218, 1988, 2014, true],
    ["B777-200ER", "Boeing", "Boeing 777-200ER", 13084, 905, 440, 7.4, 3200, 306.6, 1997, 2009, true],
    ["B777-300ER", "Boeing", "Boeing 777-300ER", 13650, 905, 550, 8.2, 3050, 375.5, 2004, 2024, true],
    ["B787-8", "Boeing", "Boeing 787-8", 13529, 903, 359, 5.2, 2600, 248.3, 2011, null, true],
    ["B787-9", "Boeing", "Boeing 787-9", 14010, 903, 406, 5.6, 2800, 292.5, 2014, null, true],
    ["B787-10", "Boeing", "Boeing 787-10", 11720, 903, 440, 5.9, 2900, 338.4, 2018, null, true],
    ["B747-400", "Boeing", "Boeing 747-400", 13490, 910, 660, 11.5, 2955, 250, 1989, 2007, true],
  ],
  family: {
      "B737-700": "737 NG",
      "B737-800": "737 NG",
      "B737-900ER": "737 NG",
      "B737-8": "737 MAX",
      "B737-9": "737 MAX",
      "B757-200": "757",
      "B767-300ER": "767",
      "B777-200ER": "777",
      "B777-300ER": "777",
      "B787-8": "787",
      "B787-9": "787",
      "B787-10": "787",
      "B747-400": "747"
  },
  visual: {},
};

export default entry;
