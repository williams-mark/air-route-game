import { typeShortName } from "./names";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AircraftType } from "@arg/contracts";
import { aircraftTypes, aircraftVisualById } from "@arg/data";
import { AVAIL_LABEL, availabilityOf, rangeNote, typicalSeats, usableRangeKm } from "./availability";
import { buildTree, manufacturerGroup, pathOf } from "./families";
import { SideView } from "./SideView";
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
  className?: string;
}

const usd = (m: number) => (m >= 100 ? `$${Math.round(m)}M` : `$${m.toFixed(m < 10 ? 2 : 1).replace(/\.0$/, "")}M`);

/** Arrow keys move focus between the sibling items of a list (roving tabindex; activation stays on Enter/Space/click). */
function moveFocus(e: KeyboardEvent<HTMLElement>, item: string, onFocusIndex: (i: number) => void) {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(item)];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  let next = i;
  if (e.key === "Home") next = 0;
  else if (e.key === "End") next = items.length - 1;
  else if (e.key === "ArrowRight" || e.key === "ArrowLeft") next = e.key === "ArrowRight" ? i + 1 : i - 1;
  else {
    // Up/down step a row in a wrapped grid (items sharing the same top), else one item.
    const rowTop = items[0]!.offsetTop;
    const cols = items.filter((it) => it.offsetTop === rowTop).length;
    const step = e.currentTarget.getAttribute("role") === "list" && cols > 1 ? cols : 1;
    next = e.key === "ArrowDown" ? i + step : i - step;
  }
  next = Math.max(0, Math.min(items.length - 1, next));
  items[next]?.focus();
  onFocusIndex(next);
}

export function AircraftPicker({ label, value, onChange, year, types = aircraftTypes, block, hideBlocked = false, owned, memoryKey, defaultOpen = false, className }: AircraftPickerProps) {
  const uid = useId();
  const remember = usePickerMemory((s) => s.remember);
  const shown = useMemo(() => (hideBlocked && block ? types.filter((t) => block(t) === null) : [...types]), [types, block, hideBlocked]);
  const tree = useMemo(() => buildTree(shown), [shown]);
  const selected = types.find((t) => t.id === value);
  const selPath = selected && shown.some((t) => t.id === selected.id) ? pathOf(selected) : undefined;
  const [open, setOpen] = useState(defaultOpen);
  const [manName, setManName] = useState<string | undefined>(selPath?.[0]);
  const [famName, setFamName] = useState<string | undefined>(selPath?.[1]);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // The browsed manufacturer always exists in the (possibly filtered) tree; fall back to the first.
  const man = tree.find((m) => m.manufacturer === manName) ?? tree[0];
  const fam = man?.families.find((f) => f.family === famName);
  const manIdx = Math.max(0, tree.findIndex((m) => m === man));
  const famIdx = man && fam ? man.families.indexOf(fam) : -1;
  const [rov, setRov] = useState({ man: -1, fam: -1, tile: -1 });
  const selTileIdx = fam ? fam.types.findIndex((t) => t.id === value) : -1;

  // Open on the selected type's family so a returning player sees their last choice in context.
  const openPicker = () => { setManName(selPath?.[0] ?? tree[0]?.manufacturer); setFamName(selPath?.[1]); setRov({ man: -1, fam: -1, tile: -1 }); setOpen(true); };
  useEffect(() => {
    if (!open) return;
    const q = rootRef.current;
    (q?.querySelector<HTMLElement>("[data-tile][aria-pressed=true]") ?? q?.querySelector<HTMLElement>("[data-fam][aria-selected=true]") ?? q?.querySelector<HTMLElement>("[data-man][aria-selected=true]"))?.focus({ preventScroll: true });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setOpen(false); setTimeout(() => toggleRef.current?.focus(), 0); };
  const pick = (t: AircraftType) => { onChange(t.id); if (memoryKey) remember(memoryKey, t.id); close(); };
  const chooseMan = (name: string) => {
    setManName(name);
    setFamName(selPath && selPath[0] === name ? selPath[1] : undefined);
    setRov((r) => ({ ...r, fam: -1, tile: -1 }));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (open && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };

  const summary = selected ? (
    <>
      <span className="ap-sum-name">{typeShortName(selected)}</span>
      <span className="ap-sum-meta">{typicalSeats(selected)} seats (max {selected.maxSeats}) {"·"} <abbr title={rangeNote(selected)}>{selected.rangeKm.toLocaleString()} km nominal, {usableRangeKm(selected).toLocaleString()} usable</abbr> {"·"} {usd(selected.listPriceUsdM)}</span>
    </>
  ) : <span className="ap-sum-name">No aircraft type available</span>;
  const tabIdx = (cur: number, own: number, selectedIdx: number) => (cur >= 0 ? cur === own : selectedIdx >= 0 ? own === selectedIdx : own === 0) ? 0 : -1;

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
          {tree.length === 0 && <p className="ap-empty">No aircraft type fits.</p>}
          {tree.length > 0 && (
            <>
              <div className="ap-mans" role="tablist" aria-label="Manufacturer" aria-orientation="vertical" onKeyDown={(e) => moveFocus(e, "[data-man]", (i) => setRov((r) => ({ ...r, man: i })))}>
                {tree.map((m, i) => {
                  const n = m.families.reduce((s, f) => s + f.types.length, 0);
                  return (
                    <button type="button" role="tab" data-man key={m.manufacturer} id={`${uid}-m${i}`} className="ap-tile ap-man" aria-selected={m === man} aria-controls={`${uid}-fams`}
                      tabIndex={tabIdx(rov.man, i, manIdx)} onFocus={() => setRov((r) => (r.man === i ? r : { ...r, man: i }))} onClick={() => chooseMan(m.manufacturer)}>
                      <b>{m.manufacturer}</b>
                      <span>{n} {n === 1 ? "type" : "types"}</span>
                      {selected && manufacturerGroup(selected.manufacturer) === m.manufacturer && <span className="ap-cur">Current</span>}
                    </button>
                  );
                })}
              </div>
              <div className="ap-main">
                <div className="ap-fams" id={`${uid}-fams`} role="tablist" aria-label={`${man?.manufacturer ?? ""} families`} aria-labelledby={man ? `${uid}-m${manIdx}` : undefined}
                  onKeyDown={(e) => moveFocus(e, "[data-fam]", (i) => setRov((r) => ({ ...r, fam: i })))}>
                  {man?.families.map((f, i) => {
                    const live = f.types.filter((t) => availabilityOf(t, year) === "current").length;
                    return (
                      <button type="button" role="tab" data-fam key={`${f.manufacturer}|${f.family}`} className="ap-tile ap-fam" aria-selected={i === famIdx} aria-controls={`${uid}-vars`}
                        tabIndex={tabIdx(rov.fam, i, famIdx)} onFocus={() => setRov((r) => (r.fam === i ? r : { ...r, fam: i }))} onClick={() => { setFamName(f.family); setRov((r) => ({ ...r, tile: -1 })); }}
                        title={`${f.types.length} ${f.types.length === 1 ? "variant" : "variants"}${live > 0 ? `, ${live} in production` : ""}`}>
                        <b>{f.family}</b>
                        <span>{man!.manufacturer === "Others" ? f.manufacturer : `${f.types.length} ${f.types.length === 1 ? "variant" : "variants"}`}</span>
                        {selected && f.types.some((t) => t.id === selected.id) && <span className="ap-cur">Current</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="ap-vars" id={`${uid}-vars`} role="tabpanel" aria-label={fam ? `${fam.family} variants` : "Variants"}>
                  {!fam && <p className="ap-empty">Choose a family to see its variants.</p>}
                  {fam && (
                    <div className="ap-grid" role="list" onKeyDown={(e) => moveFocus(e, "[data-tile]", (i) => setRov((r) => ({ ...r, tile: i })))}>
                      {fam.types.map((t, i) => {
                        const reason = block?.(t) ?? null;
                        const av = availabilityOf(t, year);
                        const o = owned?.get(t.id);
                        const isSel = t.id === value;
                        return (
                          <button type="button" role="listitem" data-tile key={t.id} className={`ap-tile ap-var ${isSel ? "sel" : ""} ${reason ? "off" : ""}`} aria-pressed={isSel} aria-disabled={reason ? true : undefined}
                            tabIndex={tabIdx(rov.tile, i, selTileIdx)} onFocus={() => setRov((r) => (r.tile === i ? r : { ...r, tile: i }))}
                            title={reason ?? undefined} onClick={() => { if (!reason) pick(t); }}>
                            <SideView visual={aircraftVisualById[t.id]} widebody={t.widebody} name={typeShortName(t)} />
                            <span className="ap-var-top"><b>{typeShortName(t)}</b><span className={`ap-badge ap-${av}`}>{AVAIL_LABEL[av]}</span></span>
                            <span className="ap-var-spec">{typicalSeats(t)} seats typical, {t.maxSeats} max</span>
                            <span className="ap-var-spec" title={rangeNote(t)}>Range {t.rangeKm.toLocaleString()} km nominal</span>
                            <span className="ap-var-spec" title={rangeNote(t)}>Usable {usableRangeKm(t).toLocaleString()} km with reserves</span>
                            <span className="ap-var-price">{usd(t.listPriceUsdM)} list</span>
                            {o !== undefined && <span className={`ap-own ${o.total === 0 ? "none" : ""}`}>{o.total === 0 ? "None owned" : `${o.total} owned, ${o.free} free`}</span>}
                            {reason && <span className="ap-why">{reason}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
