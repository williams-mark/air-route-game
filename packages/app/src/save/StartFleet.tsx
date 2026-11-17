import { useMemo, useState } from "react";
import { aircraftTypes } from "@arg/data";
import { START_FLEET_BUDGET_USD, START_FLEET_MAX_AIRCRAFT, startFleetTypes, startFleetValueUsd } from "@arg/sim";
import { typeShortName } from "../aircraft/names";
import { formatMoney } from "../sim/format";

export type FleetPick = ReadonlyArray<readonly [typeId: string, count: number]>;

/** Remove picks of types not available in `year` (the start year changed). */
export function prunePicks(picks: FleetPick, year: number): FleetPick {
  const ok = new Set(startFleetTypes(aircraftTypes, year).map((t) => t.id));
  return picks.filter(([id]) => ok.has(id));
}

/** Set one type's count (0 removes it), keeping the order the player added types in. */
export function setCount(picks: FleetPick, typeId: string, n: number): FleetPick {
  const rest = picks.filter(([id]) => id !== typeId);
  if (n <= 0) return rest;
  const i = picks.findIndex(([id]) => id === typeId);
  const next = [...rest];
  next.splice(i < 0 ? next.length : i, 0, [typeId, n]);
  return next;
}

/**
 * Start-screen fleet builder: add types in service in the start year, set counts, and see the list value against the
 * $500M budget. A type that would push the total over the budget cannot be added.
 */
export function StartFleet({ year, picks, onChange }: { year: number; picks: FleetPick; onChange: (p: FleetPick) => void }) {
  const offered = useMemo(
    () => (Number.isFinite(year) ? startFleetTypes(aircraftTypes, year) : []).slice().sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.listPriceUsdM - b.listPriceUsdM || a.name.localeCompare(b.name)),
    [year],
  );
  const byId = useMemo(() => new Map(aircraftTypes.map((t) => [t.id, t])), []);
  const [add, setAdd] = useState("");
  const value = startFleetValueUsd(aircraftTypes, picks);
  const left = START_FLEET_BUDGET_USD - value;
  const count = picks.reduce((s, [, n]) => s + n, 0);
  const fits = (id: string) => (byId.get(id)?.listPriceUsdM ?? Infinity) * 1e6 <= left + 1e-6 && count < START_FLEET_MAX_AIRCRAFT;
  const addId = add && offered.some((t) => t.id === add) ? add : offered.find((t) => fits(t.id))?.id ?? "";
  const share = Math.min(1, value / START_FLEET_BUDGET_USD);
  return (
    <div className="start-fleet" role="group" aria-label="Starting fleet">
      <div className="sf-add">
        <select aria-label="Aircraft type to add" value={addId} onChange={(e) => setAdd(e.target.value)}>
          {offered.length === 0 && <option value="">No aircraft in service that year</option>}
          {offered.map((t) => (
            <option key={t.id} value={t.id} disabled={!fits(t.id)}>{typeShortName(t)} {"·"} {t.maxSeats} seats max {"·"} {formatMoney(t.listPriceUsdM * 1e6)}</option>
          ))}
        </select>
        <button type="button" disabled={!addId || !fits(addId)} onClick={() => { const cur = picks.find(([id]) => id === addId)?.[1] ?? 0; onChange(setCount(picks, addId, cur + 1)); }}>Add</button>
      </div>
      {picks.length > 0 && (
        <ul className="sf-list">
          {picks.map(([id, n]) => {
            const t = byId.get(id);
            return (
              <li key={id}>
                <span className="sf-name">{t ? typeShortName(t) : id}</span>
                <span className="sf-step">
                  <button type="button" aria-label={`One fewer ${t ? typeShortName(t) : id}`} onClick={() => onChange(setCount(picks, id, n - 1))}>−</button>
                  <b aria-live="polite">{n}</b>
                  <button type="button" aria-label={`One more ${t ? typeShortName(t) : id}`} disabled={!fits(id)} onClick={() => onChange(setCount(picks, id, n + 1))}>+</button>
                </span>
                <span className="sf-cost">{formatMoney((t?.listPriceUsdM ?? 0) * 1e6 * n)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="sf-budget">
        <div className="sf-bar" role="img" aria-label={`${formatMoney(value)} of ${formatMoney(START_FLEET_BUDGET_USD)} budget used`}><i style={{ width: `${share * 100}%` }} /></div>
        <span>{formatMoney(value)} of {formatMoney(START_FLEET_BUDGET_USD)} {"·"} {formatMoney(Math.max(0, left))} left {"·"} {count} aircraft</span>
      </div>
    </div>
  );
}
