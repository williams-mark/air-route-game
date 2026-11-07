import { useId, useMemo, useState } from "react";
import type { AircraftType, CabinClass, CabinLayout } from "@arg/contracts";
import { aircraftTypes, airports } from "@arg/data";
import {
  allowedAcross, CABIN_CLASSES, cabinGeometry, defaultLayout, layoutEffects, pitchLimits, suggestLayouts,
  validateCabinLayout,
} from "@arg/sim";
import {
  CLASS_LABEL, fillEconomy, lengthShares, maxRowsFor, newSection, PROJECTION_ROUTES, projectRoute, sectionOf, setSection, signed, usd,
} from "./helpers";
import { SeatMap } from "./SeatMap";
import "./cabin.css";
import { bridge } from "../sim/useSim";

interface Props {
  type: AircraftType;
  layout: CabinLayout;
  onChange: (l: CabinLayout) => void;
  day: number;
  /** Route to project revenue on, e.g. "LAX-HNL". */
  defaultRoute?: string;
}

function Chip({ label, value, tone, hint }: { label: string; value: string; tone?: "pos" | "neg" | "neutral"; hint?: string }) {
  return (
    <li className={`chip ${tone ?? "neutral"}`} title={hint}>
      <span className="chip-l">{label}</span><span className="chip-v">{value}</span>
    </li>
  );
}

const tone = (n: number, eps = 0.05): "pos" | "neg" | "neutral" => (n > eps ? "pos" : n < -eps ? "neg" : "neutral");

export function CabinEditor({ type, layout, onChange, day, defaultRoute }: Props) {
  const uid = useId();
  const geo = cabinGeometry(type);
  const wide = geo.bodyClass === "widebody";
  const routes = useMemo(() => PROJECTION_ROUTES.map(([a, b]) => `${a}-${b}`), []);
  const [route, setRoute] = useState(defaultRoute ?? (wide ? "LAX-HNL" : "LAX-SFO"));
  const [origin, destination] = route.split("-") as [string, string];
  const v = useMemo(() => validateCabinLayout(type, layout), [type, layout]);
  const fx = useMemo(() => layoutEffects(type, layout), [type, layout]);
  const ref = useMemo(() => layoutEffects(type, defaultLayout(type)), [type]);
  const presets = useMemo(() => suggestLayouts(type), [type]);
  // Both projections use the airline's service levels, so the comparison isolates the layout change.
  const serviceLevels = bridge.getSim?.()?.world.serviceLevels;
  const proj = useMemo(() => projectRoute(type, layout, origin, destination, airports, aircraftTypes, day, serviceLevels), [type, layout, origin, destination, day, serviceLevels]);
  const refProj = useMemo(() => projectRoute(type, defaultLayout(type), origin, destination, airports, aircraftTypes, day, serviceLevels), [type, origin, destination, day, serviceLevels]);
  const shares = lengthShares(layout);
  const used = v.lengthUsedM / v.lengthAvailableM;

  return (
    <div className="cabin-editor">
      <div className="cabin-toolbar" role="group" aria-label="Layout presets">
        {presets.map((p) => (
          <button key={p.id} type="button" title={p.description} onClick={() => onChange(p.layout)}>{p.label}</button>
        ))}
        <button type="button" onClick={() => onChange(defaultLayout(type))} title="Back to the type's standard cabin">Reset</button>
      </div>

      <figure className="seatmap-wrap">
        <SeatMap type={type} layout={layout} />
        <figcaption className="legend" aria-hidden="true">
          {CABIN_CLASSES.map((c) => <span key={c}><i className={`sw seat-${c}`} />{CLASS_LABEL[c]}</span>)}
          <span><i className="sw exit" />Exit</span>
          <span><i className="sw galley" />Galley / lavatory</span>
        </figcaption>
      </figure>

      <div className="cabin-grid">
        <section className="cabin-controls" aria-label="Cabin sections">
          {CABIN_CLASSES.map((cls) => {
            const opts = allowedAcross(type, cls);
            if (opts.length === 0) return null;
            const s = sectionOf(layout, cls);
            const [lo, hi] = pitchLimits(cls, geo);
            const id = `${uid}-${cls}`;
            return (
              <fieldset key={cls} className={`sec sec-${cls}`}>
                <legend>
                  <label className="sec-toggle">
                    <input
                      type="checkbox" checked={!!s} aria-label={`Include ${CLASS_LABEL[cls]}`}
                      onChange={(e) => {
                        if (!e.target.checked) { onChange(setSection(layout, cls, null)); return; }
                        const ns = newSection(type, cls);
                        if (ns) onChange(setSection(layout, cls, ns, type));
                      }}
                    />
                    <i className={`sw seat-${cls}`} /> {CLASS_LABEL[cls]}
                  </label>
                  {s && <span className="sec-n">{s.rows * s.seatsAcross} seats, {(shares[cls] * 100).toFixed(0)}% of length</span>}
                </legend>
                {s ? (
                  <div className="sec-body">
                    <label htmlFor={`${id}-rows`}>Rows <output>{s.rows}</output></label>
                    <input
                      id={`${id}-rows`} type="range" min={1} max={Math.max(s.rows, maxRowsFor(type, layout, cls), 1)} value={s.rows}
                      aria-valuetext={`${s.rows} rows, ${s.rows * s.seatsAcross} seats`}
                      onChange={(e) => onChange(setSection(layout, cls, { rows: Number(e.target.value) }))}
                    />
                    <label htmlFor={`${id}-across`}>Seats across</label>
                    <select id={`${id}-across`} value={s.seatsAcross} onChange={(e) => onChange(setSection(layout, cls, { seatsAcross: Number(e.target.value) }))}>
                      {opts.map((o) => <option key={o.across} value={o.across}>{o.across} abreast ({o.label})</option>)}
                      {!opts.some((o) => o.across === s.seatsAcross) && <option value={s.seatsAcross}>{s.seatsAcross} (not allowed)</option>}
                    </select>
                    <label htmlFor={`${id}-pitch`}>Pitch <output>{s.pitchIn} in</output></label>
                    <input
                      id={`${id}-pitch`} type="range" min={lo} max={hi} step={1} value={Math.min(hi, Math.max(lo, s.pitchIn))}
                      aria-valuetext={`${s.pitchIn} inches`}
                      onChange={(e) => onChange(setSection(layout, cls, { pitchIn: Number(e.target.value) }))}
                    />
                    {cls === "Y" && <button type="button" className="fill" onClick={() => onChange(fillEconomy(type, layout))}>Fill rest of cabin with economy</button>}
                  </div>
                ) : <p className="sec-off">Not fitted.</p>}
              </fieldset>
            );
          })}
        </section>

        <section className="cabin-readout" aria-label="Effects of this layout" aria-live="polite">
          <div className="seatline">
            <strong>{fx.totalSeats}</strong> of {type.maxSeats} seats
            <span className="seat-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (fx.totalSeats / type.maxSeats) * 100)}%` }} className={fx.totalSeats > type.maxSeats ? "over" : ""} /></span>
          </div>
          <p className="by-class">
            {CABIN_CLASSES.filter((c) => fx.seatsByClass[c] > 0).map((c) => `${CLASS_LABEL[c]} ${fx.seatsByClass[c]}`).join(" · ") || "No seats"}
          </p>
          <p className="by-class">Cabin length used {(used * 100).toFixed(0)}% ({v.lengthUsedM.toFixed(1)} of {v.lengthAvailableM.toFixed(1)} m)</p>
          <ul className="chips">
            <Chip label="Comfort" value={`${fx.comfortScore}/100`} tone={tone(fx.comfortScore - ref.comfortScore, 1)} hint="Pitch and seat width against benchmarks, weighted toward premium seats" />
            <Chip label="Brand" value={`${signed(fx.brandPoints)} pts`} tone={tone(fx.brandPoints, 0.05)} hint="Change to the quality term passengers weigh when choosing your airline, versus the standard cabin" />
            <Chip label="Satisfaction" value={`${Math.round(fx.satisfaction)} (${signed(fx.satisfactionDelta, 0)})`} tone={tone(fx.satisfactionDelta, 0.5)} />
            <Chip label="Premium seats" value={`${(fx.premiumShare * 100).toFixed(0)}%`} />
            <Chip label="Cost per seat" value={`${(fx.costPerSeatIndex * 100).toFixed(0)}%`} tone={tone(1 - fx.costPerSeatIndex, 0.01)} hint="Trip cost per seat relative to the standard cabin; fewer seats cost more per seat" />
            <Chip label="Service cost / pax" value={`${(fx.serviceCostMultiplier * 100).toFixed(0)}%`} tone={tone(1 - fx.serviceCostMultiplier, 0.01)} hint="Catering and cabin service per passenger vs the standard cabin" />
          </ul>

          <div className="proj">
            <label htmlFor={`${uid}-route`}>Projected on</label>
            <select id={`${uid}-route`} value={route} onChange={(e) => setRoute(e.target.value)}>{routes.map((r) => <option key={r}>{r}</option>)}</select>
            {proj.feasible ? (
              <dl className="mini">
                <dt>Revenue per flight</dt><dd>{usd(proj.revenuePerFlight)} <span className={`delta ${tone(proj.revenuePerFlight - refProj.revenuePerFlight, 1)}`}>{refProj.feasible ? `${signed((proj.revenuePerFlight / refProj.revenuePerFlight - 1) * 100, 0)}%` : ""}</span></dd>
                <dt>Profit per flight</dt><dd>{usd(proj.profitPerFlight)}</dd>
                <dt>Load factor</dt><dd>{(proj.loadFactor * 100).toFixed(0)}%</dd>
              </dl>
            ) : <p className="sec-off">{proj.reason ?? "Cannot fly this route."}</p>}
          </div>

          <ul className="issues" role="status">
            {v.errors.map((e, i) => <li key={`e${i}`} className="err">{e.message}</li>)}
            {v.warnings.map((e, i) => <li key={`w${i}`} className="warn">{e.message}</li>)}
            {v.ok && v.warnings.length === 0 && <li className="ok">Layout is valid.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
