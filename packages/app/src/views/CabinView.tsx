import { useMemo, useState } from "react";
import { aircraftTypes } from "@arg/data";
import { defaultLayout, layoutSeats } from "@arg/sim";
import type { CabinLayout } from "@arg/contracts";
import { CabinEditor } from "../cabin/CabinEditor";
import { conform } from "../cabin/helpers";
import { useCabinDrafts } from "../cabin/store";
import { useSim } from "../sim/useSim";
import { useToasts } from "../routes/store";

const TYPES = [...aircraftTypes].sort((a, b) => a.maxSeats - b.maxSeats);

/** Standalone cabin designer: pick a type, design, and save the design as the cabin for new orders of that type. */
export default function CabinView() {
  const { day } = useSim();
  const typeId = useCabinDrafts((s) => s.designerType) || "A350-900";
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
        <label htmlFor="cabin-type">Aircraft type</label>
        <select id="cabin-type" value={type.id} onChange={(e) => { const t = TYPES.find((x) => x.id === e.target.value)!; setType(t.id); setDrafts((d) => ({ ...d, [t.id]: conform(t, d[t.id] ?? saved[t.id] ?? defaultLayout(t)) })); }}>
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}, {t.maxSeats} seats max</option>)}
        </select>
        <button
          type="button" className="primary"
          onClick={() => { save(type.id, layout); push("good", `Saved this ${type.id} cabin (${layoutSeats(layout)} seats) for new orders.`); }}
          disabled={isSaved}
        >{saved[type.id] ? (isSaved ? "Saved for new orders" : "Update saved design") : "Use for new orders"}</button>
        {saved[type.id] && <button type="button" onClick={() => { save(type.id, null); push("info", `New ${type.id} orders use the standard cabin again.`); }}>Clear saved design</button>}
      </div>
      <div className="panel-box"><CabinEditor type={type} layout={layout} onChange={set} day={day} /></div>
    </div>
  );
}
