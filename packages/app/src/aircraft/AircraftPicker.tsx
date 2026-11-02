import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AircraftType } from "@arg/contracts";
import { aircraftTypes } from "@arg/data";
import { AVAIL_LABEL, availabilityOf, typicalSeats } from "./availability";
import { buildTree, pathOf } from "./families";
import { usePickerMemory } from "./memory";
import { IconChevron } from "../shell/icons";
import "./picker.css";

export interface OwnedCount { total: number; free: number }

export interface AircraftPickerProps {
  label: string;
  value: string;
  onChange: (typeId: string) => void;
  /** Sim year, for the availability badges. */
  year: number;
  /** Candidate types (default: every type in the data). */
  types?: readonly AircraftType[];
  /** Reason a type cannot be picked, or null. Blocked tiles are disabled and show the reason. */
  block?: (t: AircraftType) => string | null;
  /** Leave blocked types out entirely instead of showing them disabled. */
  hideBlocked?: boolean;
  /** Fleet the airline owns, by type id: shown on tiles as "3 owned, 1 free". */
  owned?: ReadonlyMap<string, OwnedCount>;
  /** Persist the last choice under this key (also read by the parent for its initial value). */
  memoryKey?: string;
  defaultOpen?: boolean;
  /** Called on every pick, after onChange. */
  className?: string;
}

const usd = (m: number) => (m >= 100 ? `$${Math.round(m)}M` : `$${m.toFixed(m < 10 ? 2 : 1).replace(/\.0$/, "")}M`);
type Path = [] | [string] | [string, string];

/** Arrow keys move between tiles of a grid (rows are not needed: the grid wraps, so left/right/up/down all step). */
function gridKeys(e: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const tiles = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-tile]")];
  const i = tiles.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  const next = e.key === "Home" ? 0 : e.key === "End" ? tiles.length - 1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(tiles.length - 1, i + 1) : Math.max(0, i - 1);
  tiles[next]?.focus();
}

export function AircraftPicker({ label, value, onChange, year, types = aircraftTypes, block, hideBlocked = false, owned, memoryKey, defaultOpen = false, className }: AircraftPickerProps) {
  const uid = useId();
  const remember = usePickerMemory((s) => s.remember);
  const shown = useMemo(() => (hideBlocked && block ? types.filter((t) => block(t) === null) : [...types]), [types, block, hideBlocked]);
  const tree = useMemo(() => buildTree(shown), [shown]);
  const selected = types.find((t) => t.id === value);
  const [open, setOpen] = useState(defaultOpen);
  const [path, setPath] = useState<Path>(() => (selected ? pathOf(selected) : []));
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Open on the selected type's family so a returning player sees their last choice in context.
  const openPicker = () => { setPath(selected && shown.some((t) => t.id === selected.id) ? pathOf(selected) : []); setOpen(true); };
  useEffect(() => { if (open) rootRef.current?.querySelector<HTMLElement>("[data-tile]:not([aria-disabled=true])")?.focus({ preventScroll: true }); }, [open, path.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const man = path[0] ? tree.find((m) => m.manufacturer === path[0]) : undefined;
  const fam = man && path[1] ? man.families.find((f) => f.family === path[1]) : undefined;
  const level = fam ? 2 : man ? 1 : 0;
  const up = () => { if (level === 2) setPath([path[0]!]); else if (level === 1) setPath([]); else { setOpen(false); toggleRef.current?.focus(); } };
  const pick = (t: AircraftType) => { onChange(t.id); if (memoryKey) remember(memoryKey, t.id); setOpen(false); setTimeout(() => toggleRef.current?.focus(), 0); };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === "Escape" || e.key === "Backspace") { if (e.key === "Backspace" && (e.target as HTMLElement).tagName === "INPUT") return; e.preventDefault(); e.stopPropagation(); up(); }
  };

  const crumbs: Array<{ text: string; to: Path }> = [{ text: "All", to: [] }];
  if (man) crumbs.push({ text: man.manufacturer, to: [man.manufacturer] });
  if (fam) crumbs.push({ text: fam.family, to: [man!.manufacturer, fam.family] });

  const summary = selected ? (
    <>
      <span className="ap-sum-name">{selected.name}</span>
      <span className="ap-sum-meta">{typicalSeats(selected)} seats (max {selected.maxSeats}) {"·"} {selected.rangeKm.toLocaleString()} km {"·"} {usd(selected.listPriceUsdM)}</span>
    </>
  ) : <span className="ap-sum-name">No aircraft type available</span>;

  return (
    <div className={`ap ${className ?? ""}`} ref={rootRef} onKeyDown={onKey}>
      <span className="ap-label" id={`${uid}-l`}>{label}</span>
      <button ref={toggleRef} type="button" className="ap-toggle" aria-expanded={open} aria-controls={`${uid}-body`} aria-labelledby={`${uid}-l ${uid}-t`}
        onClick={() => (open ? setOpen(false) : openPicker())} disabled={shown.length === 0 && !selected}>
        <span className="ap-sum" id={`${uid}-t`}>{summary}</span>
        <span className="ap-change">{open ? "Close" : "Change"}<span className={`ap-chev ${open ? "up" : ""}`} aria-hidden="true"><IconChevron size={14} /></span></span>
      </button>
      {open && (
        <div className="ap-body" id={`${uid}-body`} role="group" aria-label={`${label} browser`}>
          <div className="ap-nav">
            <button type="button" className="ap-back" onClick={up} aria-label={level === 0 ? "Close the aircraft browser" : "Back one level"}>{"←"} Back</button>
            <nav aria-label="Aircraft browser path">
              <ol className="ap-crumbs">
                {crumbs.map((c, i) => (
                  <li key={c.text}>
                    {i > 0 && <span className="ap-sep" aria-hidden="true">{">"}</span>}
                    {i === crumbs.length - 1 ? <span aria-current="location" className="ap-crumb cur">{c.text}</span> : <button type="button" className="ap-crumb" onClick={() => setPath(c.to)}>{c.text}</button>}
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          <div className="ap-grid" onKeyDown={gridKeys} role="list">
            {level === 0 && tree.map((m) => {
              const n = m.families.reduce((s, f) => s + f.types.length, 0);
              return (
                <button type="button" role="listitem" data-tile key={m.manufacturer} className="ap-tile ap-tile-big" onClick={() => setPath([m.manufacturer])}>
                  <b>{m.manufacturer}</b>
                  <span>{m.families.length} {m.families.length === 1 ? "family" : "families"}, {n} {n === 1 ? "type" : "types"}</span>
                  {selected?.manufacturer === m.manufacturer && <span className="ap-cur">Current</span>}
                </button>
              );
            })}
            {level === 1 && man!.families.map((f) => {
              const seats = f.types.map((t) => t.maxSeats);
              const live = f.types.filter((t) => availabilityOf(t, year) === "current").length;
              return (
                <button type="button" role="listitem" data-tile key={f.family} className="ap-tile ap-tile-big" onClick={() => setPath([man!.manufacturer, f.family])}>
                  <b>{f.family}</b>
                  <span>{f.types.length} {f.types.length === 1 ? "variant" : "variants"}, up to {Math.min(...seats)}{Math.min(...seats) === Math.max(...seats) ? "" : `-${Math.max(...seats)}`} seats</span>
                  <span className="ap-fam-avail">{live > 0 ? `${live} in production` : availabilityOf(f.types[0]!, year) === "future" ? "Not yet in production" : "Out of production"}</span>
                  {selected && f.types.some((t) => t.id === selected.id) && <span className="ap-cur">Current</span>}
                </button>
              );
            })}
            {level === 2 && fam!.types.map((t) => {
              const reason = block?.(t) ?? null;
              const av = availabilityOf(t, year);
              const o = owned?.get(t.id);
              const isSel = t.id === value;
              return (
                <button type="button" role="listitem" data-tile key={t.id} className={`ap-tile ap-var ${isSel ? "sel" : ""} ${reason ? "off" : ""}`} aria-pressed={isSel} aria-disabled={reason ? true : undefined}
                  title={reason ?? undefined} onClick={() => { if (!reason) pick(t); }}>
                  <span className="ap-var-top"><b>{t.name.replace(t.manufacturer, "").trim() || t.name}</b><span className={`ap-badge ap-${av}`}>{AVAIL_LABEL[av]}</span></span>
                  <span className="ap-var-spec">{typicalSeats(t)} seats typical, {t.maxSeats} max</span>
                  <span className="ap-var-spec">Range {t.rangeKm.toLocaleString()} km</span>
                  <span className="ap-var-price">{usd(t.listPriceUsdM)} list</span>
                  {o !== undefined && <span className={`ap-own ${o.total === 0 ? "none" : ""}`}>{o.total === 0 ? "None owned" : `${o.total} owned, ${o.free} free`}</span>}
                  {reason && <span className="ap-why">{reason}</span>}
                </button>
              );
            })}
            {tree.length === 0 && <p className="ap-empty">No aircraft type fits.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
