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

export type Continent = "North America" | "South America" | "Europe" | "Africa" | "Asia" | "Oceania" | "Other";

/** Display order of continents (chips, hub groups). "Other" only holds unknown codes. */
export const CONTINENT_ORDER: readonly Continent[] = ["North America", "South America", "Europe", "Africa", "Asia", "Oceania", "Other"];

type C = Continent;
const NA: C = "North America", SA: C = "South America", EU: C = "Europe", AF: C = "Africa", AS: C = "Asia", OC: C = "Oceania";

/**
 * Country code -> [name, continent]. Turkey, the Caucasus and Central Asia count as Asia, Russia as Europe; the Caribbean and Central America
 * as North America. US territories appear under their own ISO code (the data uses them as `country`). "Other" is only for unknown codes.
 */
const COUNTRIES: Readonly<Record<string, readonly [string, C]>> = {
  // North America, Central America and the Caribbean
  US: ["United States", NA], CA: ["Canada", NA], MX: ["Mexico", NA], PR: ["Puerto Rico", NA], VI: ["U.S. Virgin Islands", NA], PA: ["Panama", NA],
  CR: ["Costa Rica", NA], SV: ["El Salvador", NA], GT: ["Guatemala", NA], HN: ["Honduras", NA], NI: ["Nicaragua", NA], BZ: ["Belize", NA], CU: ["Cuba", NA],
  DO: ["Dominican Republic", NA], JM: ["Jamaica", NA], BS: ["Bahamas", NA], KY: ["Cayman Islands", NA], BB: ["Barbados", NA], TT: ["Trinidad and Tobago", NA],
  AW: ["Aruba", NA], CW: ["Curaçao", NA], BQ: ["Bonaire, Sint Eustatius and Saba", NA], SX: ["Sint Maarten", NA], AG: ["Antigua and Barbuda", NA],
  KN: ["Saint Kitts and Nevis", NA], LC: ["Saint Lucia", NA], GD: ["Grenada", NA], GP: ["Guadeloupe", NA], MQ: ["Martinique", NA], HT: ["Haiti", NA],
  BM: ["Bermuda", NA], TC: ["Turks and Caicos Islands", NA],
  // South America
  BR: ["Brazil", SA], AR: ["Argentina", SA], UY: ["Uruguay", SA], PY: ["Paraguay", SA], CL: ["Chile", SA], CO: ["Colombia", SA], VE: ["Venezuela", SA],
  EC: ["Ecuador", SA], PE: ["Peru", SA], BO: ["Bolivia", SA], GY: ["Guyana", SA], SR: ["Suriname", SA], GF: ["French Guiana", SA],
  // Europe
  AL: ["Albania", EU], AD: ["Andorra", EU], AT: ["Austria", EU], BE: ["Belgium", EU], BA: ["Bosnia and Herzegovina", EU], BG: ["Bulgaria", EU],
  HR: ["Croatia", EU], CY: ["Cyprus", EU], CZ: ["Czechia", EU], DK: ["Denmark", EU], EE: ["Estonia", EU], FO: ["Faroe Islands", EU], FI: ["Finland", EU],
  FR: ["France", EU], DE: ["Germany", EU], GI: ["Gibraltar", EU], GR: ["Greece", EU], HU: ["Hungary", EU], IS: ["Iceland", EU], IE: ["Ireland", EU],
  IT: ["Italy", EU], XK: ["Kosovo", EU], LV: ["Latvia", EU], LI: ["Liechtenstein", EU], LT: ["Lithuania", EU], LU: ["Luxembourg", EU], MT: ["Malta", EU],
  MD: ["Moldova", EU], MC: ["Monaco", EU], ME: ["Montenegro", EU], NL: ["Netherlands", EU], MK: ["North Macedonia", EU], NO: ["Norway", EU], PL: ["Poland", EU],
  PT: ["Portugal", EU], RO: ["Romania", EU], SM: ["San Marino", EU], RS: ["Serbia", EU], SK: ["Slovakia", EU], SI: ["Slovenia", EU], ES: ["Spain", EU],
  SE: ["Sweden", EU], CH: ["Switzerland", EU], GB: ["United Kingdom", EU], JE: ["Jersey", EU], GG: ["Guernsey", EU], IM: ["Isle of Man", EU],
  UA: ["Ukraine", EU], BY: ["Belarus", EU], RU: ["Russia", EU],
  // Africa
  EG: ["Egypt", AF], MA: ["Morocco", AF], TN: ["Tunisia", AF], DZ: ["Algeria", AF], SD: ["Sudan", AF], ET: ["Ethiopia", AF], KE: ["Kenya", AF],
  TZ: ["Tanzania", AF], UG: ["Uganda", AF], RW: ["Rwanda", AF], DJ: ["Djibouti", AF], NG: ["Nigeria", AF], GH: ["Ghana", AF], SN: ["Senegal", AF],
  CI: ["Côte d'Ivoire", AF], CM: ["Cameroon", AF], CD: ["DR Congo", AF], GA: ["Gabon", AF], ML: ["Mali", AF], AO: ["Angola", AF], ZA: ["South Africa", AF],
  MZ: ["Mozambique", AF], ZW: ["Zimbabwe", AF], ZM: ["Zambia", AF], BW: ["Botswana", AF], NA: ["Namibia", AF], MU: ["Mauritius", AF], SC: ["Seychelles", AF],
  MG: ["Madagascar", AF], RE: ["Réunion", AF], YT: ["Mayotte", AF], CV: ["Cape Verde", AF],
  // Asia: Middle East, Caucasus, Central, South, East and Southeast
  TR: ["Turkey", AS], IL: ["Israel", AS], AE: ["United Arab Emirates", AS], QA: ["Qatar", AS], BH: ["Bahrain", AS], KW: ["Kuwait", AS], OM: ["Oman", AS],
  SA: ["Saudi Arabia", AS], JO: ["Jordan", AS], LB: ["Lebanon", AS], IQ: ["Iraq", AS], IR: ["Iran", AS], AM: ["Armenia", AS], GE: ["Georgia", AS],
  AZ: ["Azerbaijan", AS], KZ: ["Kazakhstan", AS], UZ: ["Uzbekistan", AS], KG: ["Kyrgyzstan", AS], TM: ["Turkmenistan", AS], AF: ["Afghanistan", AS],
  IN: ["India", AS], PK: ["Pakistan", AS], BD: ["Bangladesh", AS], LK: ["Sri Lanka", AS], NP: ["Nepal", AS], MV: ["Maldives", AS], JP: ["Japan", AS],
  KR: ["South Korea", AS], TW: ["Taiwan", AS], CN: ["China", AS], HK: ["Hong Kong", AS], MO: ["Macau", AS], MN: ["Mongolia", AS], TH: ["Thailand", AS],
  VN: ["Vietnam", AS], KH: ["Cambodia", AS], LA: ["Laos", AS], MM: ["Myanmar", AS], SG: ["Singapore", AS], MY: ["Malaysia", AS], BN: ["Brunei", AS],
  ID: ["Indonesia", AS], PH: ["Philippines", AS], TL: ["Timor-Leste", AS],
  // Oceania
  AU: ["Australia", OC], NZ: ["New Zealand", OC], FJ: ["Fiji", OC], PG: ["Papua New Guinea", OC], SB: ["Solomon Islands", OC], VU: ["Vanuatu", OC],
  NC: ["New Caledonia", OC], PF: ["French Polynesia", OC], CK: ["Cook Islands", OC], WS: ["Samoa", OC], TO: ["Tonga", OC], GU: ["Guam", OC],
  MP: ["Northern Mariana Islands", OC], PW: ["Palau", OC], MH: ["Marshall Islands", OC], KI: ["Kiribati", OC], AS: ["American Samoa", OC],
};

export const COUNTRY_NAME: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, v[0]]));

export const countryName = (code: string): string => COUNTRY_NAME[code] ?? code;
export const continentOf = (country: string): Continent => COUNTRIES[country]?.[1] ?? "Other";

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
