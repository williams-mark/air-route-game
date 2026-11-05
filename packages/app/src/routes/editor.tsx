import { useEffect, useId, useState } from "react";
import type { Airport, CabinClass } from "@arg/contracts";
import { CABINS, CABIN_NAME, FREQ_MAX, fareHint } from "./helpers";

export function useDebounced<T>(value: T, ms = 220): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "pos" | "neg"; sub?: string }) {
  return (
    <div className="rp-stat">
      <span className="k">{label}</span>
      <span className={`v ${tone ?? ""}`}>{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function FrequencyField({ value, onChange, max = FREQ_MAX, compact = false }: { value: number; onChange: (n: number) => void; max?: number; compact?: boolean }) {
  const id = useId();
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.round(n) || 1));
  if (compact) {
    return (
      <div className="rp-field">
        <label htmlFor={id}>Flights / wk <span className="hint">each way</span></label>
        <div className="rp-freq rp-freq-compact">
          <button type="button" className="icon-btn" aria-label="One fewer flight per week" onClick={() => onChange(clamp(value - 1))} disabled={value <= 1}>{"−"}</button>
          <input id={id} type="number" inputMode="numeric" min={1} max={max} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
          <button type="button" className="icon-btn" aria-label="One more flight per week" onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>+</button>
        </div>
      </div>
    );
  }
  return (
    <div className="rp-field">
      <label htmlFor={id}>Weekly frequency <span className="hint">(each way)</span></label>
      <div className="rp-freq">
        <button type="button" className="icon-btn" aria-label="One fewer flight per week" onClick={() => onChange(clamp(value - 1))} disabled={value <= 1}>{"−"}</button>
        <input id={id} type="number" inputMode="numeric" min={1} max={max} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
        <button type="button" className="icon-btn" aria-label="One more flight per week" onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>+</button>
        <input type="range" min={1} max={Math.min(max, Math.max(28, value))} value={Math.min(value, Math.min(max, Math.max(28, value)))} aria-label="Weekly frequency slider" onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    </div>
  );
}

const SHORT_CABIN: Record<CabinClass, string> = { F: "First", J: "Business", W: "Prem. econ.", Y: "Economy" };

export function FareFields({ text, onChange, km, from, to, compact = false }: { text: Record<CabinClass, string>; onChange: (t: Record<CabinClass, string>) => void; km: number; from?: Airport; to?: Airport; compact?: boolean }) {
  const base = useId();
  return (
    <fieldset className={`rp-fares ${compact ? "rp-fares-compact" : ""}`}>
      <legend>Fares <span className="hint">one way, USD</span></legend>
      <div className={compact ? "rp-fare-grid rp-fare-row" : "rp-fare-grid"}>
        {[...CABINS].reverse().map((c) => {
          const hint = fareHint(km, c, from, to);
          return (
            <div className="rp-fare" key={c}>
              <label htmlFor={`${base}-${c}`}>{compact ? SHORT_CABIN[c] : CABIN_NAME[c]}{c === "Y" ? "" : <span className="hint"> optional</span>}</label>
              <div className="rp-fare-in">
                <span aria-hidden="true">$</span>
                <input id={`${base}-${c}`} type="number" inputMode="numeric" min={1} step={1} value={text[c]} placeholder={c === "Y" ? "required" : "not offered"}
                  onChange={(e) => onChange({ ...text, [c]: e.target.value })} aria-describedby={`${base}-${c}-h`} />
              </div>
              <button type="button" className="link-btn rp-hint" id={`${base}-${c}-h`} onClick={() => onChange({ ...text, [c]: String(hint) })} title="Use the market fare">
                Market ${hint}
              </button>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
