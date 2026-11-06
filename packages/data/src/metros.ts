/**
 * Multi-airport metros: airports whose catchments overlap and that split one city's demand. `share` values are TUNING WEIGHTS, not
 * sourced statistics: they are rounded, normalised approximations of the members' 2015 passenger traffic (recalled, see SOURCES.md
 * "Metro groups"), nudged for the part of the market an airport could win. They sum to 1 per metro (checked by a test).
 * The LA, SF and Seattle shares are identical to `DEFAULT_METROS` in packages/sim/src/demand/metros.ts.
 */
export interface MetroGroup {
  id: string;
  name: string;
  members: { airport: string; share: number }[];
}

const m = (id: string, name: string, shares: Record<string, number>): MetroGroup => ({
  id,
  name,
  members: Object.entries(shares).map(([airport, share]) => ({ airport, share })),
});

export const metros: MetroGroup[] = [
  // United States
  m("LA", "Los Angeles", { LAX: 0.78, SNA: 0.1, ONT: 0.044, BUR: 0.042, LGB: 0.034 }),
  m("SF", "San Francisco Bay Area", { SFO: 0.7, OAK: 0.16, SJC: 0.14 }),
  m("SEA", "Seattle", { SEA: 0.88, PAE: 0.08, BFI: 0.04 }),
  m("NYC", "New York", { JFK: 0.455, LGA: 0.216, EWR: 0.302, HPN: 0.018, ISP: 0.009 }),
  m("WAS", "Washington-Baltimore", { IAD: 0.311, DCA: 0.334, BWI: 0.355 }),
  m("CHI", "Chicago", { ORD: 0.772, MDW: 0.228 }),
  m("DFW", "Dallas-Fort Worth", { DFW: 0.88, DAL: 0.12 }),
  m("HOU", "Houston", { IAH: 0.772, HOU: 0.228 }),
  m("MIA", "South Florida", { MIA: 0.574, FLL: 0.348, PBI: 0.078 }),
  m("BOS", "Boston-Providence", { BOS: 0.838, PVD: 0.092, MHT: 0.07 }),
  m("ORL", "Orlando", { MCO: 0.963, SFB: 0.037 }),
  m("PHX", "Phoenix", { PHX: 0.976, AZA: 0.024 }),
  m("TPA", "Tampa Bay", { TPA: 0.94, PIE: 0.06 }),
  // Europe
  m("LON", "London", { LHR: 0.484, LGW: 0.26, STN: 0.145, LTN: 0.079, LCY: 0.028, SEN: 0.004 }),
  m("PAR", "Paris", { CDG: 0.662, ORY: 0.298, BVA: 0.04 }),
  m("MIL", "Milan", { MXP: 0.517, LIN: 0.227, BGY: 0.256 }),
  m("ROM", "Rome", { FCO: 0.882, CIA: 0.118 }),
  // BER opened 2020-10-31 (sim world/closures.ts); shares of open members are renormalised, so before opening TXL:SXF stays 0.742:0.258 and after TXL/SXF close BER carries all of Berlin.
  m("BER", "Berlin (2015: Tegel and Schonefeld; from 2020 Brandenburg)", { TXL: 0.5194, SXF: 0.1806, BER: 0.3 }),
  m("STO", "Stockholm", { ARN: 0.863, BMA: 0.061, NYO: 0.076 }),
  m("OSL", "Oslo", { OSL: 0.88, TRF: 0.065, RYG: 0.055 }),
  m("BRU", "Brussels", { BRU: 0.772, CRL: 0.228 }),
  m("BCN", "Barcelona", { BCN: 0.954, GRO: 0.029, REU: 0.017 }),
  m("BEL", "Belfast", { BFS: 0.625, BHD: 0.375 }),
  m("VCE", "Venice", { VCE: 0.778, TSF: 0.222 }),
  m("CPH", "Copenhagen-Malmo", { CPH: 0.937, MMX: 0.063 }),
  m("GLA", "Glasgow", { GLA: 0.929, PIK: 0.071 }),
  // Globe expansion (lane/globe-data). Same status as above: tuning weights from recalled 2015 traffic, normalised.
  m("YTO", "Toronto", { YYZ: 0.94, YTZ: 0.06 }),
  m("SAO", "Sao Paulo", { GRU: 0.55, CGH: 0.3, VCP: 0.15 }),
  m("RIO", "Rio de Janeiro", { GIG: 0.65, SDU: 0.35 }),
  m("BUE", "Buenos Aires", { EZE: 0.5, AEP: 0.5 }),
  m("IST", "Istanbul", { IST: 0.7, SAW: 0.3 }),
  m("THR", "Tehran", { IKA: 0.35, THR: 0.65 }),
  m("DXB", "Dubai-Sharjah", { DXB: 0.9, SHJ: 0.1 }),
  m("TYO", "Tokyo", { HND: 0.68, NRT: 0.32 }),
  m("OSA", "Osaka-Kobe", { ITM: 0.4, KIX: 0.45, UKB: 0.15 }),
  m("SEL", "Seoul", { ICN: 0.65, GMP: 0.35 }),
  m("TPE", "Taipei", { TPE: 0.88, TSA: 0.12 }),
  m("SHA", "Shanghai", { PVG: 0.6, SHA: 0.4 }),
  m("BKK", "Bangkok", { BKK: 0.72, DMK: 0.28 }),
  m("JKT", "Jakarta", { CGK: 0.94, HLP: 0.06 }),
];
