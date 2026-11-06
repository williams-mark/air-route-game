import type { Terminal } from "@arg/contracts";

/**
 * Terminal fee tiers for major hub airports. NO airport in this table has a published per-terminal fee schedule that
 * we could find (checked LAX: LAWA FY2026 Rates & Charges, Resolution 28188, lists airport-wide rates only,
 * https://www.lawa.org/media/45881). Every feeMultiplier is therefore an ESTIMATE from a documented rule:
 *   R (1.2-1.5): rebuilt/flagship or international-gateway terminal, premium lounges, jet bridges, central location
 *   S (1.0-1.1): standard terminal
 *   L (0.7-0.9): remote, bussed, satellite, regional or low-cost terminal
 * The terminal lists themselves come from each airport's Wikipedia article / terminal maps and were entered from
 * memory (not re-fetched this session); see SOURCES.md. Single-terminal airports are omitted.
 */
const WHY = {
  R: "rule R: rebuilt/flagship or international terminal, premium facilities (1.2-1.5)",
  S: "rule S: standard terminal (1.0-1.1)",
  L: "rule L: remote/bussed/satellite/regional or low-cost terminal (0.7-0.9)",
} as const;

type Row = readonly [id: string, name: string, fee: number, share: number, rule: keyof typeof WHY];

const build = (rows: readonly Row[]): Terminal[] =>
  rows.map(([id, name, fee, share, rule]) => ({
    id,
    name,
    feeMultiplier: fee,
    premium: fee > 1.15,
    slotShare: share,
    source: `estimate: no published per-terminal fees found; ${WHY[rule]}; terminal list per Wikipedia (recalled)`,
  }));

export const terminalsByAirport: Record<string, Terminal[]> = {
  LAX: build([
    ["T1", "Terminal 1", 1.0, 0.11, "S"], ["T2", "Terminal 2", 1.0, 0.07, "S"], ["T3", "Terminal 3", 1.3, 0.12, "R"],
    ["T4", "Terminal 4", 1.0, 0.15, "S"], ["T5", "Terminal 5", 1.0, 0.12, "S"], ["T6", "Terminal 6", 1.0, 0.07, "S"],
    ["T7", "Terminal 7", 0.85, 0.05, "L"], ["T8", "Terminal 8", 0.85, 0.02, "L"],
    ["TBIT", "Tom Bradley International Terminal", 1.5, 0.2, "R"], ["MSC", "Midfield Satellite Concourse (Bradley satellite)", 0.8, 0.09, "L"],
  ]),
  SFO: build([["T1", "Terminal 1 (Harvey Milk)", 1.3, 0.2, "R"], ["T2", "Terminal 2", 1.2, 0.15, "R"], ["T3", "Terminal 3", 1.0, 0.35, "S"], ["INTL", "International Terminal", 1.5, 0.3, "R"]]),
  SAN: build([["T1", "Terminal 1", 0.9, 0.3, "L"], ["T2", "Terminal 2", 1.0, 0.6, "S"], ["COMM", "Commuter Terminal", 0.75, 0.1, "L"]]),
  OAK: build([["T1", "Terminal 1", 0.9, 0.35, "L"], ["T2", "Terminal 2", 1.0, 0.65, "S"]]),
  ATL: build([["DOM", "Domestic Terminal (Concourses T-E)", 1.0, 0.85, "S"], ["INTL", "Maynard H. Jackson Jr. International Terminal (Concourse F)", 1.3, 0.15, "R"]]),
  ORD: build([["T1", "Terminal 1", 1.2, 0.3, "R"], ["T2", "Terminal 2", 1.0, 0.12, "S"], ["T3", "Terminal 3", 1.0, 0.38, "S"], ["T5", "Terminal 5 (International)", 1.3, 0.2, "R"]]),
  DFW: build([["A", "Terminal A", 1.0, 0.22, "S"], ["B", "Terminal B", 1.0, 0.2, "S"], ["C", "Terminal C", 1.0, 0.2, "S"], ["D", "Terminal D (International)", 1.3, 0.22, "R"], ["E", "Terminal E", 1.0, 0.16, "S"]]),
  JFK: build([["T1", "Terminal 1", 1.1, 0.17, "S"], ["T4", "Terminal 4", 1.4, 0.27, "R"], ["T5", "Terminal 5 (JetBlue)", 1.3, 0.22, "R"], ["T7", "Terminal 7", 0.9, 0.08, "L"], ["T8", "Terminal 8", 1.1, 0.26, "S"]]),
  EWR: build([["A", "Terminal A (new 2022)", 1.3, 0.25, "R"], ["B", "Terminal B", 1.0, 0.3, "S"], ["C", "Terminal C", 1.0, 0.45, "S"]]),
  LGA: build([["A", "Terminal A (Marine Air Terminal)", 1.0, 0.05, "S"], ["B", "Terminal B", 1.3, 0.4, "R"], ["C", "Terminal C (Delta)", 1.3, 0.55, "R"]]),
  BOS: build([["A", "Terminal A", 1.2, 0.22, "R"], ["B", "Terminal B", 1.0, 0.3, "S"], ["C", "Terminal C", 1.0, 0.2, "S"], ["E", "Terminal E (International)", 1.3, 0.28, "R"]]),
  SEA: build([["MAIN", "Main Terminal (Concourses A-D)", 1.0, 0.62, "S"], ["NSAT", "North Satellite", 1.3, 0.15, "R"], ["SSAT", "South Satellite", 1.1, 0.23, "S"]]),
  LAS: build([["T1", "Terminal 1", 1.0, 0.75, "S"], ["T3", "Terminal 3 (International)", 1.2, 0.25, "R"]]),
  PHX: build([["T3", "Terminal 3", 1.0, 0.2, "S"], ["T4", "Terminal 4", 1.0, 0.8, "S"]]),
  IAH: build([["A", "Terminal A", 1.0, 0.15, "S"], ["B", "Terminal B", 1.0, 0.15, "S"], ["C", "Terminal C", 1.0, 0.3, "S"], ["D", "Terminal D (International)", 1.0, 0.15, "S"], ["E", "Terminal E", 1.2, 0.25, "R"]]),
  MSP: build([["T1", "Terminal 1 (Lindbergh)", 1.0, 0.92, "S"], ["T2", "Terminal 2 (Humphrey)", 0.75, 0.08, "L"]]),
  DTW: build([["MCN", "McNamara Terminal", 1.2, 0.85, "R"], ["NORTH", "North Terminal", 0.8, 0.15, "L"]]),
  PHL: build([["AW", "Terminal A-West (International)", 1.2, 0.15, "R"], ["AE", "Terminal A-East", 1.1, 0.12, "S"], ["B", "Terminal B", 1.0, 0.2, "S"], ["C", "Terminal C", 1.0, 0.18, "S"], ["DE", "Terminals D/E", 1.0, 0.22, "S"], ["F", "Terminal F (regional)", 0.85, 0.13, "L"]]),
  HNL: build([["OVER", "Overseas Terminal", 1.0, 0.6, "S"], ["INTER", "Interisland Terminal", 0.85, 0.4, "L"]]),
  LHR: build([["T2", "Terminal 2 (Queen's)", 1.4, 0.2, "R"], ["T3", "Terminal 3", 1.1, 0.25, "S"], ["T4", "Terminal 4", 1.0, 0.15, "S"], ["T5", "Terminal 5", 1.4, 0.4, "R"]]),
  LGW: build([["N", "North Terminal", 1.0, 0.5, "S"], ["S", "South Terminal", 1.0, 0.5, "S"]]),
  MAN: build([["T1", "Terminal 1", 1.0, 0.45, "S"], ["T2", "Terminal 2", 1.1, 0.35, "S"], ["T3", "Terminal 3", 0.9, 0.2, "L"]]),
  CDG: build([["T1", "Terminal 1", 0.9, 0.12, "L"], ["T2ABCD", "Terminal 2A-2D", 1.0, 0.17, "S"], ["T2EKLM", "Terminal 2E/K/L/M", 1.4, 0.4, "R"], ["T2F", "Terminal 2F", 1.1, 0.14, "S"], ["T2G", "Terminal 2G (regional, bussed)", 0.8, 0.06, "L"], ["T3", "Terminal 3", 0.75, 0.11, "L"]]),
  FRA: build([["T1", "Terminal 1", 1.2, 0.7, "R"], ["T2", "Terminal 2", 1.0, 0.3, "S"]]),
  MUC: build([["T1", "Terminal 1", 1.0, 0.45, "S"], ["T2", "Terminal 2 (with satellite)", 1.2, 0.55, "R"]]),
  MAD: build([["T1", "Terminal 1", 1.0, 0.12, "S"], ["T2", "Terminal 2", 0.9, 0.08, "L"], ["T3", "Terminal 3", 0.9, 0.05, "L"], ["T4", "Terminal 4", 1.3, 0.45, "R"], ["T4S", "Terminal 4S (satellite)", 1.2, 0.3, "R"]]),
  BCN: build([["T1", "Terminal 1", 1.1, 0.75, "S"], ["T2", "Terminal 2", 0.8, 0.25, "L"]]),
  FCO: build([["T1", "Terminal 1", 0.9, 0.25, "L"], ["T3", "Terminal 3", 1.2, 0.7, "R"], ["T5", "Terminal 5", 1.0, 0.05, "S"]]),
  LIS: build([["T1", "Terminal 1", 1.0, 0.85, "S"], ["T2", "Terminal 2 (low-cost)", 0.7, 0.15, "L"]]),
  DUB: build([["T1", "Terminal 1", 1.0, 0.55, "S"], ["T2", "Terminal 2", 1.2, 0.45, "R"]]),
  DXB: build([["T1", "Terminal 1", 1.1, 0.3, "S"], ["T2", "Terminal 2", 0.7, 0.1, "L"], ["T3", "Terminal 3 (Emirates)", 1.4, 0.6, "R"]]),
  SIN: build([["T1", "Terminal 1", 1.0, 0.2, "S"], ["T2", "Terminal 2", 1.2, 0.25, "R"], ["T3", "Terminal 3", 1.2, 0.4, "R"], ["T4", "Terminal 4", 0.85, 0.15, "L"]]),
  KUL: build([["KLIA", "KLIA Main Terminal", 1.2, 0.6, "R"], ["KLIA2", "klia2 (low-cost)", 0.7, 0.4, "L"]]),
  CGK: build([["T1", "Terminal 1", 0.9, 0.2, "L"], ["T2", "Terminal 2", 1.0, 0.25, "S"], ["T3", "Terminal 3", 1.3, 0.55, "R"]]),
  MNL: build([["T1", "Terminal 1", 0.9, 0.2, "L"], ["T2", "Terminal 2", 1.0, 0.1, "S"], ["T3", "Terminal 3", 1.1, 0.5, "S"], ["T4", "Terminal 4 (domestic)", 0.7, 0.2, "L"]]),
  ICN: build([["T1", "Terminal 1", 1.0, 0.45, "S"], ["T2", "Terminal 2", 1.3, 0.55, "R"]]),
  NRT: build([["T1", "Terminal 1", 1.1, 0.35, "S"], ["T2", "Terminal 2", 1.0, 0.4, "S"], ["T3", "Terminal 3 (low-cost)", 0.7, 0.25, "L"]]),
  HND: build([["T1", "Terminal 1", 1.0, 0.28, "S"], ["T2", "Terminal 2", 1.0, 0.32, "S"], ["T3", "Terminal 3 (International)", 1.3, 0.4, "R"]]),
  KIX: build([["T1", "Terminal 1", 1.0, 0.65, "S"], ["T2", "Terminal 2 (low-cost)", 0.7, 0.35, "L"]]),
  TPE: build([["T1", "Terminal 1", 1.0, 0.45, "S"], ["T2", "Terminal 2", 1.2, 0.55, "R"]]),
  CAN: build([["T1", "Terminal 1", 1.0, 0.55, "S"], ["T2", "Terminal 2", 1.1, 0.45, "S"]]),
  PEK: build([["T1", "Terminal 1", 0.8, 0.1, "L"], ["T2", "Terminal 2", 1.0, 0.2, "S"], ["T3", "Terminal 3", 1.3, 0.7, "R"]]),
  PVG: build([["T1", "Terminal 1", 1.0, 0.45, "S"], ["T2", "Terminal 2", 1.1, 0.55, "S"]]),
  DEL: build([["T1", "Terminal 1 (low-cost domestic)", 0.8, 0.25, "L"], ["T2", "Terminal 2", 0.8, 0.1, "L"], ["T3", "Terminal 3", 1.3, 0.65, "R"]]),
  BOM: build([["T1", "Terminal 1 (domestic)", 0.8, 0.2, "L"], ["T2", "Terminal 2", 1.3, 0.8, "R"]]),
  SYD: build([["T1", "Terminal 1 (International)", 1.3, 0.45, "R"], ["T2", "Terminal 2 (Domestic)", 0.9, 0.25, "L"], ["T3", "Terminal 3 (Qantas Domestic)", 1.0, 0.3, "S"]]),
  MEL: build([["T1", "Terminal 1 (Qantas)", 1.0, 0.3, "S"], ["T2", "Terminal 2 (International)", 1.2, 0.3, "R"], ["T3", "Terminal 3 (Virgin)", 1.0, 0.25, "S"], ["T4", "Terminal 4 (low-cost)", 0.7, 0.15, "L"]]),
  YYZ: build([["T1", "Terminal 1", 1.2, 0.65, "R"], ["T3", "Terminal 3", 1.0, 0.35, "S"]]),
  YVR: build([["DOM", "Domestic Terminal", 1.0, 0.35, "S"], ["INTL", "International Terminal", 1.2, 0.5, "R"], ["SOUTH", "South Terminal (regional)", 0.7, 0.15, "L"]]),
  MEX: build([["T1", "Terminal 1", 1.0, 0.65, "S"], ["T2", "Terminal 2", 0.9, 0.35, "L"]]),
  GRU: build([["T1", "Terminal 1", 0.9, 0.25, "L"], ["T2", "Terminal 2", 1.0, 0.35, "S"], ["T3", "Terminal 3", 1.3, 0.4, "R"]]),
  JNB: build([["A", "Terminal A (International)", 1.1, 0.45, "S"], ["B", "Terminal B (Domestic)", 1.0, 0.55, "S"]]),
};

export const terminalsFor = (airportId: string): Terminal[] => terminalsByAirport[airportId] ?? [];
