// Simple airport schematic for a hub card: the longest runway (length from the data, drawn to a fixed scale) and the
// terminals as a list. The data has no runway or terminal geometry, so terminals are not placed on a map.
import type { Airport } from "@arg/contracts";
import { runwayShare, type TerminalRow } from "./hubs";

interface Props {
  airport: Airport;
  rows: readonly TerminalRow[];
  /** Terminal the move dialog is staged on (dashed outline); undefined when none. */
  targetId?: string;
}

/** Runway bar and terminal tiles. The selected (current) terminal is highlighted; a staged target has a dashed outline. */
export function AirportSchematic({ airport, rows, targetId }: Props) {
  const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
  const share = runwayShare(airport.runwayM);
  return (
    <figure className="hubs-schematic" aria-label={`${airport.id} airport schematic`}>
      <div className="hubs-rwy-track" role="img" aria-label={`Longest runway ${n0(airport.runwayM)} metres`}>
        <div className="hubs-rwy" style={{ width: `${share * 100}%` }} />
      </div>
      <figcaption className="hubs-cap">Longest runway {n0(airport.runwayM)} m (bar drawn to a 4,500 m scale). Runway count, layout and orientation are not in the data.</figcaption>
      <ul className="hubs-terms" aria-label={`${airport.id} terminals`}>
        {rows.map((r) => (
          <li key={r.id} className={`hubs-term${r.yours ? " yours" : ""}${!r.yours && r.id === targetId ? " target" : ""}`} aria-current={r.yours ? "true" : undefined}>
            <b>{r.name}</b>
            <span>x{r.feeMultiplier.toFixed(2)} fee{r.yours ? " (your terminal)" : r.id === targetId ? " (selected to move to)" : ""}</span>
          </li>
        ))}
      </ul>
      <p className="hubs-cap">Terminals are listed, not placed: the data has no terminal positions.</p>
    </figure>
  );
}
