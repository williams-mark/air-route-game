import type { Entry } from "./schema.js";

// Provenance for every row: SOURCES.md, "Aircraft". Add new variants below the existing ones; keep ids unique across all files.
const entry: Entry = {
  rows: [
    ["A319", "Airbus", "Airbus A319ceo", 6940, 840, 160, 2.4, 1850, 92, 1996, 2020, false],
    ["A320", "Airbus", "Airbus A320ceo", 6200, 840, 180, 2.7, 2100, 101, 1988, 2020, false],
    ["A321", "Airbus", "Airbus A321ceo", 5900, 840, 236, 3.1, 2180, 118, 1994, 2021, false],
    ["A320N", "Airbus", "Airbus A320neo", 6300, 840, 195, 2.3, 1951, 111, 2016, null, false],
    ["A321N", "Airbus", "Airbus A321neo", 6500, 840, 244, 2.7, 1988, 130, 2017, null, false],
    ["A220-100", "Airbus", "Airbus A220-100", 6300, 828, 133, 2.2, 1500, 81, 2016, null, false],
    ["A220-300", "Airbus", "Airbus A220-300", 6200, 828, 149, 2.4, 1900, 92, 2016, null, false],
    ["A330-200", "Airbus", "Airbus A330-200", 13450, 870, 406, 6.2, 2770, 238.5, 1998, 2019, true],
    ["A330-300", "Airbus", "Airbus A330-300", 11750, 870, 440, 6.4, 2770, 264.2, 1994, 2020, true],
    ["A330-900", "Airbus", "Airbus A330-900", 13334, 870, 460, 5.6, 2770, 296.4, 2018, null, true],
    ["A350-900", "Airbus", "Airbus A350-900", 15750, 903, 440, 5.7, 2600, 317.4, 2015, null, true],
    ["A350-1000", "Airbus", "Airbus A350-1000", 16700, 903, 480, 6.2, 2700, 366.5, 2018, null, true],
  ],
  family: {
      "A319": "A320 family",
      "A320": "A320 family",
      "A321": "A320 family",
      "A320N": "A320 family",
      "A321N": "A320 family",
      "A220-100": "A220",
      "A220-300": "A220",
      "A330-200": "A330",
      "A330-300": "A330",
      "A330-900": "A330",
      "A350-900": "A350",
      "A350-1000": "A350"
  },
  visual: {},
};

export default entry;
