/** One row per aircraft type. See SOURCES.md ("Aircraft") for the provenance of every field. */
export type Row = [id: string, manufacturer: string, name: string, rangeKm: number, cruiseKmh: number, maxSeats: number, fuelBurnKgPerKm: number, runwayNeededM: number, listPriceUsdM: number, introYear: number, endYear: number | null, widebody: boolean];

/** Engine arrangement, for drawing the side view: wing = pods under the wings, rear = pods on the aft fuselage, tail = one engine at the tail fin (trijets). */
export type EngineLayout = "wing2" | "wing4" | "rear2" | "rear3" | "wing2+tail";

/** Dimensions and configuration used only to draw the white-tail side view; not simulation inputs. Source them from manufacturer airport-planning documents or the same pages as the row, and cite them in SOURCES.md. */
export interface Visual {
  lengthM: number;
  wingspanM: number;
  layout: EngineLayout;
  /** "t" = T-tail (727, DC-9, MD-80, 717), "conventional" otherwise. */
  tail?: "t" | "conventional";
  winglets?: boolean;
  /** Propeller-driven (turboprop or piston): draw propellers on the wing engines; engine count comes from layout (wing2 or wing4). */
  prop?: boolean;
  /** 747-style upper deck: "short" (SUD, -100/-200/-300 SUD), "stretched" (-300, -400), "full" (747-8 is stretched; use "stretched"). Omit for none. */
  upperDeck?: "short" | "stretched";
}

/** What each manufacturer file exports. family = the tile shown across the top of the order page ("737", "A300", "DC-9"); keep one spelling per family across files. */
export interface Entry {
  rows: Row[];
  family: Record<string, string>;
  visual: Record<string, Visual>;
}
