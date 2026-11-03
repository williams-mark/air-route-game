import type { Airport } from "@arg/contracts";

/** Small display tables for the airport pickers. Unknown codes fall back to the code itself, so new data never breaks the UI. */
export const US_STATE_NAME: Readonly<Record<string, string>> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico", VI: "U.S. Virgin Islands", GU: "Guam", AS: "American Samoa", MP: "Northern Mariana Islands",
};

export type Continent = "North America" | "Europe" | "Other";

const EUROPE: Readonly<Record<string, string>> = {
  AL: "Albania", AD: "Andorra", AT: "Austria", BE: "Belgium", BA: "Bosnia and Herzegovina", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus", CZ: "Czechia",
  DK: "Denmark", EE: "Estonia", FO: "Faroe Islands", FI: "Finland", FR: "France", DE: "Germany", GI: "Gibraltar", GR: "Greece", HU: "Hungary", IS: "Iceland",
  IE: "Ireland", IT: "Italy", XK: "Kosovo", LV: "Latvia", LI: "Liechtenstein", LT: "Lithuania", LU: "Luxembourg", MT: "Malta", MD: "Moldova", MC: "Monaco",
  ME: "Montenegro", NL: "Netherlands", MK: "North Macedonia", NO: "Norway", PL: "Poland", PT: "Portugal", RO: "Romania", SM: "San Marino", RS: "Serbia",
  SK: "Slovakia", SI: "Slovenia", ES: "Spain", SE: "Sweden", CH: "Switzerland", GB: "United Kingdom", JE: "Jersey", GG: "Guernsey", IM: "Isle of Man",
  UA: "Ukraine", BY: "Belarus", TR: "Turkey", RU: "Russia", GE: "Georgia", AM: "Armenia", AZ: "Azerbaijan",
};
const NORTH_AMERICA: Readonly<Record<string, string>> = { US: "United States", CA: "Canada", MX: "Mexico" };
const OTHER: Readonly<Record<string, string>> = { MA: "Morocco", DZ: "Algeria", TN: "Tunisia", EG: "Egypt", IL: "Israel", LB: "Lebanon", JO: "Jordan" };

export const COUNTRY_NAME: Readonly<Record<string, string>> = { ...EUROPE, ...NORTH_AMERICA, ...OTHER };

export const countryName = (code: string): string => COUNTRY_NAME[code] ?? code;
export const continentOf = (country: string): Continent => (country in NORTH_AMERICA ? "North America" : country in EUROPE ? "Europe" : "Other");

/** Name of an airport's region: the state for US airports, otherwise the country; the raw code when unknown. */
export function regionName(a: Pick<Airport, "region" | "country">): string {
  if (a.country === "US") return US_STATE_NAME[a.region] ?? a.region;
  return COUNTRY_NAME[a.region] ?? COUNTRY_NAME[a.country] ?? a.region;
}

/** "Los Angeles Intl, California, United States" style line; collapses repeats such as "Germany, Germany". */
export function placeLabel(a: Pick<Airport, "name" | "region" | "country">): string {
  const parts = [a.name, regionName(a), countryName(a.country)];
  return parts.filter((p, i) => p && parts.indexOf(p) === i).join(", ");
}
