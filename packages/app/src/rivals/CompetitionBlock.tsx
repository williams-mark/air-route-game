import type { Route } from "@arg/contracts";
import { aircraftTypes } from "@arg/data";
import { useSimSelector } from "../sim/useSim";
import { ARCHETYPE_LABEL, competitionFor, fareBandText, fareVsBand } from "./helpers";

const FLAG = { below: "Your fare is below", within: "Your fare is within", above: "Your fare is above" } as const;

/** 'Competition in this market' block for the route inspector. Fog of war: seats, aircraft and an estimated economy fare band only. */
export function CompetitionBlock({ route, yourWeeklySeats }: { route: Route; yourWeeklySeats: number }) {
  const rivals = useSimSelector((s) => s.rivals);
  const comp = competitionFor(rivals, route, yourWeeklySeats);
  const typeName = (id: string) => aircraftTypes.find((t) => t.id === id)?.name ?? id;
  return (
    <section aria-labelledby="rp-comp" className="rp-sec">
      <h3 id="rp-comp">Competition in this market <span className="hint">(estimates)</span></h3>
      {!comp ? (
        <p className="comp-sum">No competitor flies {route.origin} to {route.destination} right now.</p>
      ) : (
        <>
          <p className="comp-sum">
            {comp.carriers.length} {comp.carriers.length === 1 ? "competitor" : "competitors"}, about {Math.round(comp.rivalSeats).toLocaleString()} seats a week
            ({Math.round(comp.rivalSeatShare * 100)}% of seats in the market). Your economy fare is ${comp.yourFare}.
          </p>
          <table className="comp-table">
            <thead><tr><th scope="col">Carrier</th><th scope="col" className="num">Seats/wk</th><th scope="col">Aircraft</th><th scope="col">Economy fare</th></tr></thead>
            <tbody>
              {comp.carriers.map((c) => {
                const v = fareVsBand(comp.yourFare, c.fareBand);
                return (
                  <tr key={c.rivalId}>
                    <td>{c.name}<br /><span className="hint">{ARCHETYPE_LABEL[c.archetype]}</span></td>
                    <td className="num">{c.weeklySeats.toLocaleString()}</td>
                    <td>{typeName(c.typeId)}</td>
                    <td>{fareBandText(c.fareBand)}<br />{v !== "within" ? <span className={`comp-flag ${v}`}>{FLAG[v]} their band</span> : <span className="hint">{FLAG[v]} their band</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
