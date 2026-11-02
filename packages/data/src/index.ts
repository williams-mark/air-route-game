import type { Airport, AircraftType } from "@arg/contracts";

// Placeholder rows only; T3/T4 replace these with sourced data (OurAirports, manufacturer specs).
export const airports: Airport[] = [
  { id: "LAX", name: "Los Angeles Intl", city: "Los Angeles", lat: 33.9425, lon: -118.4081, region: "CA", runwayM: 3939, metroPopulation: 13_200_000, gdpPerCapita: 75000, tourismIndex: 0.8, slotsPerHour: 100 },
  { id: "HNL", name: "Daniel K. Inouye Intl", city: "Honolulu", lat: 21.3187, lon: -157.9225, region: "HI", runwayM: 3749, metroPopulation: 1_000_000, gdpPerCapita: 65000, tourismIndex: 1, slotsPerHour: 60 },
];

export const aircraftTypes: AircraftType[] = [];
