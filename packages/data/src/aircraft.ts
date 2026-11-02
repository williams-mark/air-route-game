import type { AircraftType } from "@arg/contracts";

// See SOURCES.md for per-field provenance. fuelBurnKgPerKm is an ESTIMATE (cruise average);
// runwayNeededM is APPROXIMATE (takeoff field length at typical MTOW, sea level, ISA);
// listPriceUsdM is manufacturer LIST price (real deals are heavily discounted; older types are estimates).
// endYear = end of production of that variant (null = still in production). Retired-from-service dates are not modelled.
type Row = [id: string, manufacturer: string, name: string, rangeKm: number, cruiseKmh: number, maxSeats: number, fuelBurnKgPerKm: number, runwayNeededM: number, listPriceUsdM: number, introYear: number, endYear: number | null, widebody: boolean];

const rows: Row[] = [
  ["B737-700", "Boeing", "Boeing 737-700", 6230, 840, 149, 2.6, 1800, 89, 1998, 2019, false],
  ["B737-800", "Boeing", "Boeing 737-800", 5436, 840, 189, 2.9, 2300, 106, 1998, 2019, false],
  ["B737-900ER", "Boeing", "Boeing 737-900ER", 6045, 840, 220, 3.1, 3000, 112, 2007, 2019, false],
  ["B737-8", "Boeing", "Boeing 737 MAX 8", 6570, 840, 189, 2.4, 2500, 122, 2017, null, false],
  ["B737-9", "Boeing", "Boeing 737 MAX 9", 6570, 840, 220, 2.5, 2600, 129, 2018, null, false],
  ["A319", "Airbus", "Airbus A319ceo", 6940, 840, 156, 2.4, 1850, 92, 1996, 2020, false],
  ["A320", "Airbus", "Airbus A320ceo", 6150, 840, 180, 2.7, 2090, 101, 1988, 2020, false],
  ["A321", "Airbus", "Airbus A321ceo", 5950, 840, 220, 3.1, 2180, 118, 1994, 2020, false],
  ["A320N", "Airbus", "Airbus A320neo", 6300, 840, 195, 2.3, 2100, 110, 2016, null, false],
  ["A321N", "Airbus", "Airbus A321neo", 6500, 840, 240, 2.7, 2300, 130, 2017, null, false],
  ["A220-100", "Airbus", "Airbus A220-100", 6100, 828, 135, 2.2, 1500, 81, 2016, null, false],
  ["A220-300", "Airbus", "Airbus A220-300", 6300, 828, 160, 2.4, 1900, 92, 2016, null, false],
  ["E175", "Embraer", "Embraer E175", 4074, 830, 88, 1.8, 2250, 42, 2004, null, false],
  ["CRJ700", "Bombardier", "Bombardier CRJ-700", 3045, 828, 78, 1.6, 1600, 41, 2001, 2020, false],
  ["CRJ900", "Bombardier", "Bombardier CRJ-900", 2876, 828, 90, 1.8, 2050, 46, 2003, 2020, false],
  ["ATR72-600", "ATR", "ATR 72-600", 1528, 510, 78, 1.3, 1370, 26, 2011, null, false],
  ["B757-200", "Boeing", "Boeing 757-200", 7250, 850, 239, 4.2, 2000, 80, 1983, 2004, false],
  ["B767-300ER", "Boeing", "Boeing 767-300ER", 11070, 850, 351, 6.2, 2750, 218, 1988, 2014, true],
  ["B777-200ER", "Boeing", "Boeing 777-200ER", 13080, 905, 440, 7.4, 3200, 306, 1997, 2009, true],
  ["B777-300ER", "Boeing", "Boeing 777-300ER", 13650, 905, 550, 8.2, 3050, 375, 2004, 2023, true],
  ["B787-8", "Boeing", "Boeing 787-8", 13530, 903, 359, 5.2, 2600, 248, 2011, null, true],
  ["B787-9", "Boeing", "Boeing 787-9", 14140, 903, 406, 5.6, 2800, 292, 2014, null, true],
  ["B787-10", "Boeing", "Boeing 787-10", 11910, 903, 440, 5.9, 2900, 338, 2018, null, true],
  ["A330-200", "Airbus", "Airbus A330-200", 13450, 870, 406, 6.2, 2770, 238, 1998, 2020, true],
  ["A330-300", "Airbus", "Airbus A330-300", 11750, 870, 440, 6.4, 2770, 264, 1994, 2020, true],
  ["A330-900", "Airbus", "Airbus A330-900", 12130, 870, 460, 5.6, 2770, 296, 2018, null, true],
  ["A350-900", "Airbus", "Airbus A350-900", 15000, 903, 440, 5.7, 2600, 317, 2015, null, true],
  ["A350-1000", "Airbus", "Airbus A350-1000", 16100, 903, 480, 6.2, 2700, 366, 2018, null, true],
  ["B747-400", "Boeing", "Boeing 747-400", 13450, 913, 660, 11.5, 3000, 250, 1989, 2009, true],
];

export const aircraftTypes: AircraftType[] = rows.map(
  ([id, manufacturer, name, rangeKm, cruiseKmh, maxSeats, fuelBurnKgPerKm, runwayNeededM, listPriceUsdM, introYear, endYear, widebody]) => ({
    id, manufacturer, name, rangeKm, cruiseKmh, maxSeats, fuelBurnKgPerKm, runwayNeededM, listPriceUsdM, introYear, endYear, widebody,
  }),
);
