import { useMemo, useState } from "react";
import { aircraftTypes } from "@arg/data";
import { CLASS_NAME, SERVICE_LEVELS, SERVICE_LEVEL_NAME, dayToDate, defaultLayout, layoutSeats } from "@arg/sim";
import type { CabinClass, CabinLayout, ServiceLevel } from "@arg/contracts";
import { CabinEditor } from "../cabin/CabinEditor";
import { conform } from "../cabin/helpers";
import { useCabinDrafts } from "../cabin/store";
import { bridge, useSim } from "../sim/useSim";
import { useToasts } from "../routes/store";
import { usePickerMemory } from "../aircraft/memory";
import { AircraftPicker } from "../aircraft/AircraftPicker";

const TYPES = [...aircraftTypes].sort((a, b) => a.maxSeats - b.maxSeats);
const SERVICE_CABINS: CabinClass[] = ["F", "J", "W", "Y"];

/** Airline-wide service level per cabin. Superior service supports higher premium fares; basic service earns less. */
function ServiceLevels() {
  const push = useToasts((s) => s.push);
  const levels = bridge.getSim?.()?.world.serviceLevels ?? {};
  const set = (cabin: CabinClass, level: ServiceLevel) => {
    const res = bridge.dispatch({ kind: "setServiceLevel", cabin, level });
    if (res && !res.ok) push("alert", res.error.message);
    else if (res && res.ok) push("good", `${CLASS_NAME[cabin]} service is now ${SERVICE_LEVEL_NAME[level].toLowerCase()}.`);
  };
  return (
    <fieldset className="svc-levels">
      <legend>Service level by cabin <span className="hint">airline-wide</span></legend>
      {SERVICE_CABINS.map((c) => (
        <label key={c} className="svc-level">
          <span>{CLASS_NAME[c]}</span>
          <select value={levels[c] ?? "standard"} onChange={(e) => set(c, e.target.value as ServiceLevel)} aria-label={`${CLASS_NAME[c]} service level`}>
            {SERVICE_LEVELS.map((l) => <option key={l} value={l}>{SERVICE_LEVEL_NAME[l]}</option>)}
          </select>
        </label>
      ))}
    </fieldset>
  );
}

/** Standalone cabin designer: pick a type, design, and save the design as the cabin for new orders of that type. */
export default function CabinView() {
  const { day } = useSim();
  const remembered = usePickerMemory((s) => s.last.cabin);
  const typeId = useCabinDrafts((s) => s.designerType) || remembered || "A350-900";
  const setType = useCabinDrafts((s) => s.setDesignerType);
  const saved = useCabinDrafts((s) => s.orderLayouts);
  const save = useCabinDrafts((s) => s.setOrderLayout);
  const push = useToasts((s) => s.push);
  const type = TYPES.find((t) => t.id === typeId) ?? TYPES[0]!;
  const [drafts, setDrafts] = useState<Record<string, CabinLayout>>({});
  const layout = drafts[type.id] ?? saved[type.id] ?? defaultLayout(type);
  const set = (l: CabinLayout) => setDrafts((d) => ({ ...d, [type.id]: l }));
  const isSaved = useMemo(() => JSON.stringify(saved[type.id]) === JSON.stringify(layout), [saved, type.id, layout]);
  return (
    <div className="page">
      <header className="page-head">
        <h1>Cabin designer</h1>
        <p>Choose how many First, Business, Premium economy and Economy rows an aircraft type gets, how many seats across each, and the pitch. Roomier, more premium cabins raise brand and satisfaction and cost more to serve; denser cabins carry more passengers but hurt comfort. Premium seats only earn fares where the market has business and premium demand.</p>
      </header>
      <div className="cabin-head-row">
        <AircraftPicker label="Aircraft type" value={type.id} types={TYPES} year={dayToDate(day).year} className="cabin-picker" memoryKey="cabin"
          onChange={(id) => { const t = TYPES.find((x) => x.id === id)!; setType(t.id); setDrafts((d) => ({ ...d, [t.id]: conform(t, d[t.id] ?? saved[t.id] ?? defaultLayout(t)) })); }} />
        <button
          type="button" className="primary"
          onClick={() => { save(type.id, layout); push("good", `Saved this ${type.id} cabin (${layoutSeats(layout)} seats) for new orders.`); }}
          disabled={isSaved}
        >{saved[type.id] ? (isSaved ? "Saved for new orders" : "Update saved design") : "Use for new orders"}</button>
        {saved[type.id] && <button type="button" onClick={() => { save(type.id, null); push("info", `New ${type.id} orders use the standard cabin again.`); }}>Clear saved design</button>}
      </div>
      <ServiceLevels />
      <div className="panel-box"><CabinEditor type={type} layout={layout} onChange={set} day={day} /></div>
    </div>
  );
}
