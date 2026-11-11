import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aircraftFamilyById, aircraftTypes, airportById, airports, canFlyDistance, canFlyRoute, distanceKm, isLandPair, isOverwaterRoute, maxOverwaterKm, metros } from "./index.js";

const ap = (id: string) => {
  const a = airportById.get(id);
  if (!a) throw new Error(`missing ${id}`);
  return a;
};
const ac = (id: string) => {
  const t = aircraftTypes.find((x) => x.id === id);
  if (!t) throw new Error(`missing ${id}`);
  return t;
};

// [latMin, latMax, lonMin, lonMax] bounding boxes (generous, from public geography) per US state / country; a sanity check on the generated coordinates.
const US_BOUNDS: Record<string, readonly [number, number, number, number]> = {
  AL: [30.1, 35.0, -88.5, -84.9], AK: [51.0, 71.5, -170, -129], AZ: [31.3, 37.0, -114.9, -109.0], AR: [33.0, 36.5, -94.7, -89.6],
  CA: [32.4, 42.1, -124.5, -114.1], CO: [36.9, 41.1, -109.1, -102.0], CT: [40.9, 42.1, -73.8, -71.7], DC: [38.7, 39.0, -77.2, -76.9],
  FL: [24.4, 31.1, -87.7, -80.0], GA: [30.3, 35.0, -85.7, -80.8], HI: [18.8, 22.3, -160.3, -154.7], ID: [41.9, 49.1, -117.3, -111.0],
  IL: [36.9, 42.6, -91.6, -87.4], IN: [37.7, 41.8, -88.2, -84.7], IA: [40.3, 43.6, -96.7, -90.1], KS: [36.9, 40.1, -102.1, -94.5],
  KY: [36.4, 39.2, -89.6, -81.9], LA: [28.9, 33.1, -94.1, -88.8], ME: [42.9, 47.5, -71.1, -66.9], MD: [37.9, 39.8, -79.5, -75.0],
  MA: [41.2, 42.9, -73.6, -69.9], MI: [41.6, 48.3, -90.5, -82.1], MN: [43.4, 49.5, -97.3, -89.4], MS: [30.1, 35.0, -91.7, -88.0],
  MO: [35.9, 40.7, -95.8, -89.0], MT: [44.3, 49.1, -116.1, -104.0], NE: [39.9, 43.1, -104.1, -95.3], NV: [35.0, 42.1, -120.1, -114.0],
  NH: [42.6, 45.4, -72.6, -70.6], NJ: [38.9, 41.4, -75.6, -73.8], NM: [31.3, 37.1, -109.1, -103.0], NY: [40.4, 45.1, -79.8, -71.8],
  NC: [33.8, 36.7, -84.4, -75.4], ND: [45.9, 49.1, -104.1, -96.5], OH: [38.3, 42.0, -84.9, -80.5], OK: [33.6, 37.1, -103.1, -94.4],
  OR: [41.9, 46.3, -124.6, -116.4], PA: [39.7, 42.3, -80.6, -74.6], RI: [41.1, 42.1, -71.9, -71.1], SC: [32.0, 35.3, -83.4, -78.5],
  SD: [42.4, 46.0, -104.1, -96.4], TN: [34.9, 36.7, -90.4, -81.6], TX: [25.8, 36.6, -106.7, -93.5], UT: [36.9, 42.1, -114.1, -109.0],
  VT: [42.7, 45.1, -73.5, -71.4], VA: [36.5, 39.5, -83.7, -75.2], WA: [45.5, 49.1, -124.9, -116.9], WV: [37.1, 40.7, -82.7, -77.7],
  WI: [42.4, 47.1, -92.9, -86.7], WY: [40.9, 45.1, -111.1, -104.0],
};
const EU_BOUNDS: Record<string, readonly [number, number, number, number]> = {
  GB: [49.8, 60.9, -8.2, 1.8], JE: [49.1, 49.3, -2.3, -2.0], GG: [49.4, 49.6, -2.7, -2.4], IM: [54.0, 54.5, -4.9, -4.3], IE: [51.3, 55.5, -10.7, -5.9],
  FR: [41.3, 51.2, -5.2, 9.7], DE: [47.2, 55.1, 5.8, 15.1], NL: [50.7, 53.6, 3.3, 7.3], BE: [49.4, 51.6, 2.5, 6.5], LU: [49.4, 50.2, 5.7, 6.6],
  CH: [45.8, 47.9, 5.9, 10.6], AT: [46.3, 49.1, 9.5, 17.2], IT: [35.4, 47.1, 6.6, 18.6], ES: [27.5, 43.9, -18.3, 4.4], PT: [32.5, 42.2, -17.3, -6.1],
  DK: [54.5, 57.8, 8.0, 15.2], SE: [55.3, 69.1, 10.9, 24.2], NO: [57.9, 71.2, 4.4, 31.2], FI: [59.7, 70.1, 20.5, 31.6], IS: [63.3, 66.6, -24.6, -13.4],
  EE: [57.5, 59.7, 21.7, 28.2], LV: [55.6, 57.8, 20.9, 28.3], LT: [53.9, 56.5, 20.9, 26.9], PL: [49.0, 54.9, 14.1, 24.2], CZ: [48.5, 51.1, 12.0, 18.9],
  HU: [45.7, 48.6, 16.1, 22.9], SK: [47.7, 49.7, 16.8, 22.6], RO: [43.6, 48.3, 20.2, 29.7], BG: [41.2, 44.3, 22.3, 28.7], SI: [45.4, 46.9, 13.3, 16.6],
  HR: [42.3, 46.6, 13.4, 19.5], GR: [34.8, 41.8, 19.3, 28.3], CY: [34.5, 35.7, 32.2, 34.6], MT: [35.8, 36.1, 14.2, 14.6], RS: [42.2, 46.2, 18.8, 23.0],
  BA: [42.5, 45.3, 15.7, 19.7], ME: [41.8, 43.6, 18.4, 20.4], MK: [40.8, 42.4, 20.4, 23.1], AL: [39.6, 42.7, 19.2, 21.1], XK: [41.8, 43.3, 20.0, 21.8],
};

// Globe expansion: generous boxes for the larger world countries (everything else gets the global lat/lon check only).
const WORLD_BOUNDS: Record<string, readonly [number, number, number, number]> = {
  CA: [41.6, 83.2, -141.1, -52.5], MX: [14.4, 32.8, -118.5, -86.6], BR: [-33.8, 5.4, -74.0, -34.7], AR: [-55.2, -21.7, -73.6, -53.6],
  CL: [-56.0, -17.4, -109.6, -66.4], CO: [-4.3, 13.5, -81.8, -66.8], PE: [-18.4, 0.0, -81.4, -68.6], EG: [22.0, 31.7, 24.7, 36.9],
  MA: [27.6, 35.9, -13.2, -1.0], ZA: [-34.9, -22.0, 16.4, 33.0], TR: [35.8, 42.2, 25.6, 44.9], SA: [16.3, 32.2, 34.5, 55.7],
  IN: [6.7, 35.7, 68.0, 97.5], CN: [18.1, 53.6, 73.5, 135.1], JP: [24.0, 45.6, 122.9, 145.9], KR: [33.1, 38.7, 124.6, 131.0],
  TH: [5.6, 20.5, 97.3, 105.7], ID: [-11.1, 6.1, 95.0, 141.1], PH: [4.5, 21.2, 116.9, 126.7], AU: [-43.7, -10.6, 113.0, 153.7],
  NZ: [-47.4, -34.3, 166.3, 178.7], AE: [22.6, 26.1, 51.5, 56.4], MY: [0.8, 7.5, 99.5, 119.4], VN: [8.4, 23.4, 102.1, 109.5],
};

describe("airports", () => {
  it("distances are sane", () => {
    expect(distanceKm(ap("LAX"), ap("HNL"))).toBeGreaterThan(4000);
    expect(distanceKm(ap("LAX"), ap("HNL"))).toBeLessThan(4200);
    expect(Math.abs(distanceKm(ap("LAX"), ap("SFO")) - 543)).toBeLessThan(10);
    expect(distanceKm(ap("LAX"), ap("LAX"))).toBe(0);
  });
  it("ids unique, regions and bounds valid", () => {
    expect(new Set(airports.map((a) => a.id)).size).toBe(airports.length);
    for (const a of airports) {
      expect(a.id, a.id).toMatch(/^[A-Z]{3}$/);
      const isUs = a.country === "US";
      if (!isUs) expect(a.region, a.id).toBe(a.country); // outside the US region is the ISO country code
      expect(a.country, a.id).toMatch(/^[A-Z]{2}$/);
      expect(a.lat, a.id).toBeGreaterThanOrEqual(-90); expect(a.lat, a.id).toBeLessThanOrEqual(90);
      expect(a.lon, a.id).toBeGreaterThanOrEqual(-180); expect(a.lon, a.id).toBeLessThanOrEqual(180);
      const box = isUs ? US_BOUNDS[a.region] : (EU_BOUNDS[a.country] ?? WORLD_BOUNDS[a.country]);
      if (isUs) expect(box, `${a.id} ${a.region}/${a.country} has a bounds entry`).toBeDefined();
      if (!box) { expect(a.runwayM, a.id).toBeGreaterThanOrEqual(600); continue; }
      const [la0, la1, lo0, lo1] = box;
      expect(a.lat, a.id).toBeGreaterThan(la0); expect(a.lat, a.id).toBeLessThan(la1);
      expect(a.lon, a.id).toBeGreaterThan(lo0); expect(a.lon, a.id).toBeLessThan(lo1);
      expect(a.runwayM, a.id).toBeGreaterThanOrEqual(600);
      expect(a.tourismIndex).toBeGreaterThanOrEqual(0); expect(a.tourismIndex).toBeLessThanOrEqual(1);
      expect(a.metroPopulation).toBeGreaterThan(0); expect(a.slotsPerHour).toBeGreaterThan(0); expect(a.gdpPerCapita).toBeGreaterThan(0);
      expect(a.landmass, a.id).toMatch(/^[A-Za-z]{2}(-[A-Za-z]+)*$/);
    }
  });
  it("airport counts per continent and country are in the expected range", () => {
    const us = airports.filter((a) => a.country === "US");
    const eu = airports.filter((a) => EU_BOUNDS[a.country] !== undefined);
    expect(us.length).toBeGreaterThanOrEqual(200); expect(us.length).toBeLessThanOrEqual(320);
    expect(eu.length).toBeGreaterThanOrEqual(230); expect(eu.length).toBeLessThanOrEqual(380);
    expect(new Set(us.map((a) => a.region)).size).toBe(50); // 49 states + DC: Delaware had no scheduled service in 2015 (see SOURCES.md)
    expect(us.some((a) => a.region === "DE")).toBe(false);
    for (const c of ["GB", "FR", "DE", "ES", "IT", "NO", "PL", "GR"]) expect(eu.filter((a) => a.country === c).length, c).toBeGreaterThanOrEqual(8);
    for (const c of ["RS", "BA", "ME", "MK", "AL", "XK", "IE", "IS", "CH", "AT"]) expect(eu.some((a) => a.country === c), c).toBe(true);
    for (const c of ["RU", "BY", "UA", "TR"]) expect(eu.some((a) => a.country === c), c).toBe(false);
    expect(airports.filter((a) => a.country === "US" && a.landmass === "US-AK").length).toBeGreaterThanOrEqual(5);
  });
  it("existing California/Hawaii/Oregon/Washington rows are untouched", () => {
    expect(airports.slice(0, 60).map((a) => a.region).every((r) => ["CA", "HI", "OR", "WA"].includes(r))).toBe(true);
    expect(ap("LAX")).toMatchObject({ lat: 33.9425, lon: -118.408, metroPopulation: 13300000, gdpPerCapita: 70000, tourismIndex: 0.75, slotsPerHour: 100 });
    expect(ap("SEA")).toMatchObject({ metroPopulation: 3733000, gdpPerCapita: 85000, slotsPerHour: 75 });
  });
  it("Oregon and Washington commercial-service airports are present with OurAirports runways", () => {
    for (const id of ["PDX", "EUG", "MFR", "RDM", "SLE", "OTH", "LMT", "PDT"]) expect(ap(id).region, id).toBe("OR");
    for (const id of ["SEA", "BFI", "PAE", "GEG", "BLI", "PSC", "YKM", "EAT", "ALW", "PUW"]) expect(ap(id).region, id).toBe("WA");
    expect(ap("SEA").runwayM).toBeGreaterThan(3500); // 16R 11,901 ft
    expect(ap("PDX").runwayM).toBe(3353); // 11,000 ft
    expect(ap("BFI").runwayM).toBeGreaterThan(3000); // 10,007 ft
  });
  it("every airport id has a source note in SOURCES.md", () => {
    const src = readFileSync(new URL("../SOURCES.md", import.meta.url), "utf8");
    for (const a of airports) {
      expect(src, a.id).toContain(a.id);
      // Airports added by the world expansion (everything except the original CA/HI/OR/WA rows) have a row in the evidence table.
      if (!["CA", "HI", "OR", "WA"].includes(a.region)) expect(src, `${a.id} evidence row`).toContain(`| ${a.id} | `);
    }
  });
});

describe("aircraft", () => {
  it("ids unique and years ordered", () => {
    expect(new Set(aircraftTypes.map((t) => t.id)).size).toBe(aircraftTypes.length);
    for (const t of aircraftTypes) if (t.endYear !== null) expect(t.introYear).toBeLessThanOrEqual(t.endYear);
  });
  it("widebody flag consistent with seats", () => {
    for (const t of aircraftTypes) {
      if (t.widebody) expect(t.maxSeats).toBeGreaterThanOrEqual(300);
      else expect(t.maxSeats).toBeLessThanOrEqual(270); // single-aisle ceiling: the stretched DC-8 Super 61/63 seat 259/269 in one aisle
    }
  });
  it("range feasibility", () => {
    const d = distanceKm(ap("LAX"), ap("HNL"));
    expect(canFlyDistance(ac("B787-9"), d)).toBe(true);
    expect(canFlyDistance(ac("ATR72-600"), d)).toBe(false);
    expect(canFlyDistance(ac("CRJ900"), d)).toBe(false);
    // A220-100 published range (~6,300 km) exceeds LAX-HNL.
    expect(canFlyDistance(ac("A220-100"), d)).toBe(true);
  });
});

describe("overwater / canFlyRoute", () => {
  const can = (t: string, a: string, b: string) => canFlyRoute(ac(t), ap(a), ap(b));
  it("every type has an overwater limit", () => {
    for (const t of aircraftTypes) expect(maxOverwaterKm[t.id]).toBeGreaterThan(0);
  });
  it("overwater classification", () => {
    expect(isOverwaterRoute(ap("LAX"), ap("HNL"))).toBe(true);
    expect(isOverwaterRoute(ap("HNL"), ap("OGG"))).toBe(true);
    expect(isOverwaterRoute(ap("HNL"), ap("JRF"))).toBe(false); // same island
    expect(isOverwaterRoute(ap("LAX"), ap("SFO"))).toBe(false);
    // Mainland states are joined by land; Hawaii is water from all of them.
    expect(isOverwaterRoute(ap("LAX"), ap("SEA"))).toBe(false);
    expect(isOverwaterRoute(ap("PDX"), ap("SEA"))).toBe(false);
    expect(isOverwaterRoute(ap("SFO"), ap("PDX"))).toBe(false);
    expect(isOverwaterRoute(ap("SEA"), ap("HNL"))).toBe(true);
    expect(isOverwaterRoute(ap("PDX"), ap("OGG"))).toBe(true);
    expect(isLandPair(ap("SEA"), ap("SAN"))).toBe(true);
    expect(isLandPair(ap("SEA"), ap("HNL"))).toBe(false);
  });
  it("A220 is NOT barred from LAX-HNL: ETOPS 180 (Transport Canada, Jan 2019) + 6,300 km range; Airbus cited Honolulu-LA as an A220 route", () => {
    expect(can("A220-100", "LAX", "HNL")).toBe(true);
    expect(can("A220-300", "SFO", "OGG")).toBe(true);
  });
  it("narrowbody ETOPS-180 twins reach Hawaii from CA", () => {
    for (const t of ["B737-8", "B737-800", "A321N", "B757-200"]) expect(can(t, "LAX", "HNL")).toBe(true);
  });
  it("regional types cannot cross to Hawaii but can hop between islands", () => {
    for (const t of ["E175", "CRJ900", "CRJ700", "ATR72-600"]) expect(can(t, "LAX", "HNL")).toBe(false);
    for (const t of ["CRJ900", "ATR72-600"]) expect(can(t, "HNL", "OGG")).toBe(true);
    expect(can("ATR72-600", "HNL", "LIH")).toBe(true);
  });
  it("runway at both ends is enforced", () => {
    expect(ap("LUP").runwayM).toBeLessThan(1300);
    expect(can("B737-8", "HNL", "LUP")).toBe(false);
    expect(can("ATR72-600", "HNL", "LUP")).toBe(false); // ATR needs ~1.1 km; Kalaupapa is ~0.8 km
    expect(can("ATR72-600", "HNL", "MKK")).toBe(true);
  });
  it("four-engine and widebody twins are not overwater-limited on CA-HI", () => {
    expect(can("B777-300ER", "LAX", "HNL")).toBe(true);
    expect(can("B787-9", "SFO", "HNL")).toBe(true);
  });
});

describe("runwayRequiredM (stage-length rule)", () => {
  const can = (t: string, a: string, b: string) => canFlyRoute(ac(t), ap(a), ap(b));
  it("lets A330-200 and 787-9 reach Maui from LAX but not a 777-200ER", () => {
    expect(can("A330-200", "LAX", "OGG")).toBe(true);
    expect(can("B787-9", "LAX", "OGG")).toBe(true);
    expect(can("B777-200ER", "LAX", "OGG")).toBe(false);
  });
});

describe("landmass convention and world routes", () => {
  const can = (t: string, a: string, b: string) => canFlyRoute(ac(t), ap(a), ap(b));
  it("land pairs and overwater pairs follow landmass", () => {
    expect(isOverwaterRoute(ap("LHR"), ap("CDG"))).toBe(true); // Great Britain <-> mainland
    expect(isLandPair(ap("LHR"), ap("CDG"))).toBe(false);
    expect(isOverwaterRoute(ap("DUB"), ap("LHR"))).toBe(true); // Ireland <-> Great Britain
    expect(isOverwaterRoute(ap("BFS"), ap("DUB"))).toBe(false); // island of Ireland
    expect(isOverwaterRoute(ap("BFS"), ap("GLA"))).toBe(true);
    expect(isOverwaterRoute(ap("PHX"), ap("DEN"))).toBe(false);
    expect(isLandPair(ap("PHX"), ap("DEN"))).toBe(true);
    expect(isLandPair(ap("SEA"), ap("LAX"))).toBe(true);
    expect(isLandPair(ap("JFK"), ap("SEA"))).toBe(true);
    expect(isOverwaterRoute(ap("SEA"), ap("ANC"))).toBe(true); // CONUS <-> Alaska
    expect(isOverwaterRoute(ap("ANC"), ap("FAI"))).toBe(false);
    expect(isOverwaterRoute(ap("JFK"), ap("LHR"))).toBe(true);
    expect(isOverwaterRoute(ap("CPH"), ap("ARN"))).toBe(false); // Oresund bridge, Scandinavia by land
    expect(isOverwaterRoute(ap("CPH"), ap("RNN"))).toBe(true); // Bornholm
    expect(isOverwaterRoute(ap("MAD"), ap("TFS"))).toBe(true);
    expect(isOverwaterRoute(ap("TFS"), ap("LPA"))).toBe(true); // different Canary islands
    expect(isOverwaterRoute(ap("TFS"), ap("TFN"))).toBe(false); // same island
    expect(isOverwaterRoute(ap("HER"), ap("CHQ"))).toBe(false); // both Crete
    expect(isOverwaterRoute(ap("ATH"), ap("HER"))).toBe(true);
    expect(isOverwaterRoute(ap("FCO"), ap("CTA"))).toBe(true);
    expect(isOverwaterRoute(ap("KEF"), ap("LHR"))).toBe(true);
  });
  it("transatlantic: widebodies yes, 757 and narrowbodies via the northern alternates, regional types no", () => {
    expect(distanceKm(ap("JFK"), ap("LHR"))).toBeGreaterThan(5400);
    expect(can("B787-9", "JFK", "LHR")).toBe(true);
    expect(can("B777-300ER", "JFK", "LHR")).toBe(true);
    expect(can("B747-400", "JFK", "LHR")).toBe(true);
    expect(can("A350-900", "LAX", "CDG")).toBe(true);
    expect(can("B757-200", "JFK", "LHR")).toBe(true); // ETOPS-180, Gander/Shannon/Keflavik cover the track
    expect(can("B757-200", "BOS", "DUB")).toBe(true);
    for (const t of ["A321N", "B737-8", "A220-300"]) expect(can(t, "BOS", "DUB"), t).toBe(true);
    for (const t of ["E175", "CRJ900", "CRJ700", "ATR72-600"]) expect(can(t, "JFK", "LHR"), t).toBe(false);
    for (const t of ["E175", "CRJ900", "ATR72-600"]) expect(can(t, "BOS", "KEF"), t).toBe(false);
    // Southern North Atlantic (no alternates, far from the Azores track): only the very long-legged ETOPS types.
    expect(can("B737-8", "MIA", "MAD")).toBe(false);
    expect(can("B787-9", "MIA", "MAD")).toBe(true);
    expect(can("A330-300", "ATL", "FRA")).toBe(true);
  });
  it("ETOPS-style limits: no alternate on the way means the maxOverwaterKm bound; alternates along the way extend it", () => {
    // Juneau-Minneapolis (CONUS<->AK is overwater by convention): the great circle runs over Canada. Before the globe expansion no alternate
    // in the data set was within 60 minutes of it (E175 barred); with Canadian airports (YXY, YZF, YEG, ...) in the data every point is covered.
    expect(distanceKm(ap("JNU"), ap("MSP"))).toBeGreaterThan(maxOverwaterKm["E175"]!);
    expect(can("E175", "JNU", "MSP")).toBe(true);
    expect(can("A320", "JNU", "MSP")).toBe(true);
    expect(can("E175", "SFO", "SIT")).toBe(true);
    // Canary Islands from Madrid: Spanish coast, Morocco-side island chain and Lanzarote/Fuerteventura keep an alternate within 60 minutes.
    expect(distanceKm(ap("MAD"), ap("TFS"))).toBeGreaterThan(maxOverwaterKm["E175"]!);
    expect(can("E175", "MAD", "TFS")).toBe(true);
    expect(can("ATR72-600", "MAD", "TFS")).toBe(false); // range 1,404 km
    expect(can("ATR72-600", "TFS", "LPA")).toBe(true);
    expect(can("ATR72-600", "ATH", "RHO")).toBe(true);
    expect(can("ATR72-600", "JFK", "BOS")).toBe(true); // land pair
    // Hawaii behaviour is unchanged: regional types cannot reach it, the open Pacific has no alternate.
    expect(can("E175", "LAX", "HNL")).toBe(false);
  });
  it("Alaska", () => {
    expect(can("B737-800", "SEA", "ANC")).toBe(true);
    expect(can("E175", "ANC", "FAI")).toBe(true);
  });
});

describe("globe expansion", () => {
  const can = (t: string, a: string, b: string) => canFlyRoute(ac(t), ap(a), ap(b));
  const CONTINENT: Record<string, string> = {};
  const put = (c: string, codes: string) => codes.split(" ").forEach((x) => (CONTINENT[x] = c));
  put("namerica", "US CA MX GT SV HN NI CR PA BZ CU DO HT PR VI JM BS KY BB TT AW CW BQ SX AG KN LC GD VC GP MQ BM TC");
  put("samerica", "BR AR CO PE CL EC VE UY PY BO GY SR GF");
  put("africa", "EG MA TN DZ SD ET KE TZ UG RW DJ NG GH SN CI CM CD GA ML AO ZA MZ ZW ZM BW NA MU SC MG RE YT CV");
  put("mideast", "TR IL AE QA BH KW OM SA JO LB IQ IR AM GE AZ KZ UZ KG TM AF");
  put("asia", "IN PK BD LK NP MV JP KR TW CN HK MO MN TH VN KH LA MM SG MY BN ID PH TL");
  put("oceania", "AU NZ FJ PG SB VU NC PF CK WS TO GU MP PW MH KI AS");
  const count = (c: string) => airports.filter((a) => CONTINENT[a.country] === c).length;
  const europe = airports.filter((a) => EU_BOUNDS[a.country] !== undefined);

  it("every airport has a country, a region, a landmass, positive runway and coordinates; ids and coordinates are not duplicated", () => {
    expect(new Set(airports.map((a) => a.id)).size).toBe(airports.length);
    const spots = new Set<string>();
    for (const a of airports) {
      expect(a.country, a.id).toMatch(/^[A-Z]{2}$/);
      expect(a.region.length, a.id).toBeGreaterThan(0);
      expect(a.landmass, a.id).toBeTruthy();
      expect(a.runwayM, a.id).toBeGreaterThan(0);
      expect(Number.isFinite(a.lat) && Number.isFinite(a.lon), a.id).toBe(true);
      expect(a.name.trim().length, a.id).toBeGreaterThan(2);
      const key = `${a.lat.toFixed(3)},${a.lon.toFixed(3)}`; // 0.001 deg is about 100 m: two airports never share a runway reference point
      expect(spots.has(key), `${a.id} duplicates the coordinates of another airport`).toBe(false);
      spots.add(key);
    }
    const names = airports.map((a) => `${a.city}|${a.name}`.toLowerCase());
    expect(new Set(names).size, "no two airports share city and name").toBe(names.length);
  });
  it("every country code used is covered by a continent group", () => {
    for (const a of airports) expect(a.country === "US" || EU_BOUNDS[a.country] !== undefined || CONTINENT[a.country] !== undefined, `${a.id} ${a.country}`).toBe(true);
  });
  it("the world is covered: counts per continent", () => {
    expect(airports.length).toBeGreaterThanOrEqual(900);
    expect(europe.length).toBeGreaterThanOrEqual(230);
    expect(count("namerica") - airports.filter((a) => a.country === "US").length).toBeGreaterThanOrEqual(85); // Canada, Mexico, Central America, Caribbean
    expect(count("samerica")).toBeGreaterThanOrEqual(60);
    expect(count("africa")).toBeGreaterThanOrEqual(40);
    expect(count("mideast")).toBeGreaterThanOrEqual(45);
    expect(count("asia")).toBeGreaterThanOrEqual(150);
    expect(count("oceania")).toBeGreaterThanOrEqual(30);
    for (const id of ["YYZ", "MEX", "PTY", "SJU", "GRU", "EZE", "BOG", "CAI", "JNB", "NBO", "DXB", "IST", "DEL", "PEK", "HND", "ICN", "SIN", "CGK", "SYD", "AKL", "HNL", "ANC"]) expect(airportById.has(id), id).toBe(true);
    expect(airports.filter((a) => a.landmass === "US-HI").length).toBeGreaterThanOrEqual(10); // Hawaii and Alaska still present
    expect(airports.filter((a) => a.landmass === "US-AK").length).toBeGreaterThanOrEqual(5);
  });
  it("overwater rules: islands and continents", () => {
    const water = (a: string, b: string) => isOverwaterRoute(ap(a), ap(b));
    // Japan: Honshu, Shikoku and Kyushu are one landmass; Hokkaido, Okinawa and the Sakishima islands are not
    expect(water("HND", "ITM")).toBe(false); expect(water("HND", "FUK")).toBe(false);
    expect(water("HND", "CTS")).toBe(true); expect(water("HND", "OKA")).toBe(true); expect(water("OKA", "ISG")).toBe(true);
    // Philippines and Indonesia: by island
    expect(water("MNL", "CRK")).toBe(false); expect(water("MNL", "CEB")).toBe(true); expect(water("CEB", "DVO")).toBe(true); expect(water("DVO", "CGY")).toBe(false);
    expect(water("CGK", "SUB")).toBe(false); expect(water("CGK", "DPS")).toBe(true); expect(water("CGK", "KNO")).toBe(true); expect(water("BKI", "KCH")).toBe(false);
    expect(water("SIN", "KUL")).toBe(false); expect(water("SIN", "BKI")).toBe(true);
    // Australia / New Zealand / Tasmania
    expect(water("SYD", "MEL")).toBe(false); expect(water("SYD", "PER")).toBe(false); expect(water("MEL", "HBA")).toBe(true);
    expect(water("SYD", "AKL")).toBe(true); expect(water("AKL", "WLG")).toBe(false); expect(water("AKL", "CHC")).toBe(true);
    // Caribbean and the Americas
    expect(water("MIA", "NAS")).toBe(true); expect(water("SJU", "STT")).toBe(true); expect(water("SDQ", "PAP")).toBe(false); expect(water("HAV", "SDQ")).toBe(true);
    expect(water("JFK", "YYZ")).toBe(false); expect(water("LAX", "MEX")).toBe(false); expect(water("MEX", "PTY")).toBe(false); expect(water("PTY", "BOG")).toBe(true);
    expect(water("GRU", "EZE")).toBe(false); expect(water("SEA", "YVR")).toBe(false); expect(water("ANC", "YVR")).toBe(true);
    // Eurasia-Africa is joined by land
    expect(water("IST", "ATH")).toBe(false); expect(water("CAI", "TLV")).toBe(false); expect(water("DEL", "DXB")).toBe(false); expect(water("PEK", "SIN")).toBe(false);
    expect(water("CAI", "CDG")).toBe(false); expect(water("LHR", "DXB")).toBe(true); expect(water("PEK", "HND")).toBe(true); expect(water("ICN", "CJU")).toBe(true);
    expect(water("JNB", "MRU")).toBe(true); expect(water("JNB", "TNR")).toBe(true); expect(water("DXB", "MLE")).toBe(true);
    expect(isLandPair(ap("HND"), ap("ITM"))).toBe(true); expect(isLandPair(ap("YYZ"), ap("YUL"))).toBe(true); expect(isLandPair(ap("HND"), ap("CTS"))).toBe(false);
  });
  it("long-haul and island routes are judged correctly around the world", () => {
    expect(can("B787-9", "HND", "SIN")).toBe(true);
    expect(can("B787-9", "HND", "SYD")).toBe(true);
    expect(can("B737-8", "SYD", "AKL")).toBe(true); // 2,150 km Tasman, ETOPS-180 narrowbody
    expect(can("E175", "SYD", "AKL")).toBe(false); // 60-minute type, no alternate on the Tasman
    expect(can("ATR72-600", "MNL", "CEB")).toBe(true); // 570 km across the Visayan sea
    expect(can("ATR72-600", "DPS", "LOP")).toBe(true);
    expect(can("B737-800", "LAX", "MEX")).toBe(true);
    expect(can("A320", "JFK", "YYZ")).toBe(true);
    expect(can("E175", "MIA", "NAS")).toBe(true);
    expect(can("B777-300ER", "LHR", "HND")).toBe(true);
    expect(can("B737-800", "HND", "OKA")).toBe(true);
    expect(can("B737-800", "TLV", "LAX")).toBe(false); // 12,000 km exceeds the usable range
    expect(can("A350-900", "SIN", "LHR")).toBe(true);
  });
  it("runway data is plausible for known airports (OurAirports longest runway)", () => {
    expect(ap("HND").runwayM).toBeGreaterThan(3000); expect(ap("DXB").runwayM).toBeGreaterThan(4000); expect(ap("YTZ").runwayM).toBeLessThan(1500);
    expect(ap("SDU").runwayM).toBeLessThan(1500); expect(ap("TGU").runwayM).toBeLessThan(2000);
  });
});

describe("metros", () => {
  it("members exist, are unique, and shares sum to 1", () => {
    expect(new Set(metros.map((m) => m.id)).size).toBe(metros.length);
    for (const m of metros) {
      expect(m.members.length, m.id).toBeGreaterThanOrEqual(2);
      let sum = 0;
      for (const x of m.members) {
        expect(airportById.has(x.airport), `${m.id}: ${x.airport}`).toBe(true);
        expect(x.share, `${m.id}: ${x.airport}`).toBeGreaterThan(0);
        sum += x.share;
      }
      expect(sum, m.id).toBeCloseTo(1, 9);
    }
    const seen = new Set<string>();
    for (const m of metros) for (const x of m.members) { expect(seen.has(x.airport), `${x.airport} in two metros`).toBe(false); seen.add(x.airport); }
  });
  it("keeps the shares used by the sim for LA, SF and Seattle", () => {
    const sh = (id: string) => Object.fromEntries(metros.find((m) => m.id === id)!.members.map((x) => [x.airport, x.share]));
    expect(sh("LA")).toEqual({ LAX: 0.78, SNA: 0.1, ONT: 0.044, BUR: 0.042, LGB: 0.034 });
    expect(sh("SF")).toEqual({ SFO: 0.7, OAK: 0.16, SJC: 0.14 });
    expect(sh("SEA")).toEqual({ SEA: 0.88, PAE: 0.08, BFI: 0.04 });
  });
});

describe("aircraft families", () => {
  it("every type has a family tile and every family entry names a real type", () => {
    for (const t of aircraftTypes) expect(aircraftFamilyById[t.id], t.id).toBeTruthy();
    const ids = new Set(aircraftTypes.map((t) => t.id));
    for (const id of Object.keys(aircraftFamilyById)) expect(ids.has(id), id).toBe(true);
  });
});
