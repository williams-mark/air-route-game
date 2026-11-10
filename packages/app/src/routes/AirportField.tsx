import { useEffect, useId, useMemo, useRef, useState } from "react";
import { uiAirports as airports } from "../dev/airportSource";
import { airportFacets, resolveEnter, searchAirports, type AirportFilter } from "./airportSearch";
import { continentOf, placeLabel, regionName, type Continent } from "./geoNames";

interface Props {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  exclude?: string[];
  picking: boolean;
  onPickMode: () => void;
  autoFocus?: boolean;
  /** Hide the "Pick on map" toggle (fields outside route creation). */
  hidePick?: boolean;
}

const MAX_OPTIONS = 40;
const byId = new Map(airports.map((a) => [a.id, a]));

/** IATA / city / name / state / country typeahead (ARIA combobox) with filter chips and a "pick on map" toggle. */
export function AirportField({ label, value, onChange, exclude = [], picking, onPickMode, autoFocus, hidePick }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  // Arrow keys moved the highlight; until then Enter must not take the list's first row for the player's choice.
  const [navigated, setNavigated] = useState(false);
  const [filter, setFilter] = useState<AirportFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => { setText(value ?? ""); }, [value]);
  const query = value && text === value ? "" : text;
  const facets = useMemo(() => airportFacets(airports, filter), [filter]);
  const filterable = facets.continents.length > 1 || facets.countries.length > 1 || facets.states.length > 1;
  const options = useMemo(() => searchAirports(query, airports, { limit: MAX_OPTIONS, exclude, filter }), [query, exclude.join(","), filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches = useMemo(() => (open ? searchAirports(query, airports, { limit: 5000, exclude, filter }).length : 0), [open, query, exclude.join(","), filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = value ? byId.get(value) : undefined;
  const activeCount = (filter.continent ? 1 : 0) + (filter.country ? 1 : 0) + (filter.state ? 1 : 0);

  const choose = (code: string) => { onChange(code); setText(code); setOpen(false); };
  const commit = () => {
    const exact = airports.find((a) => a.id.toLowerCase() === text.trim().toLowerCase() && !exclude.includes(a.id));
    if (exact) choose(exact.id);
    else setText(value ?? "");
  };
  const apply = (f: AirportFilter) => { setFilter(f); setIdx(0); setOpen(true); input.current?.focus(); };
  const listId = `${id}-list`;
  const chip = (key: string, text: string, on: boolean, onClick: () => void) => (
    <button key={key} type="button" className={`af-chip${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>{text}</button>
  );
  return (
    <div className="rp-field airport-field" ref={wrap} onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) { setOpen(false); commit(); } }}>
      <label htmlFor={id}>{label}</label>
      <div className="af-row">
        <input
          ref={input} id={id} type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" spellCheck={false}
          autoFocus={autoFocus} placeholder="Code, city or country" value={text} maxLength={32}
          aria-activedescendant={open && options[idx] ? `${id}-o-${options[idx]!.id}` : undefined}
          onChange={(e) => { setText(e.target.value); setOpen(true); setIdx(0); setNavigated(false); }}
          onFocus={(e) => { setOpen(true); setNavigated(false); e.currentTarget.select(); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { setOpen(true); setNavigated(true); setIdx((i) => Math.min(options.length - 1, i + 1)); e.preventDefault(); }
            else if (e.key === "ArrowUp") { setNavigated(true); setIdx((i) => Math.max(0, i - 1)); e.preventDefault(); }
            else if (e.key === "PageDown") { setNavigated(true); setIdx((i) => Math.min(options.length - 1, i + 6)); e.preventDefault(); }
            else if (e.key === "PageUp") { setNavigated(true); setIdx((i) => Math.max(0, i - 6)); e.preventDefault(); }
            else if (e.key === "Enter") {
              const r = open ? resolveEnter({ text, value, options, index: idx, navigated, list: airports, exclude }) : ({ kind: "keep" } as const);
              if (r.kind === "choose") choose(r.id); else { setOpen(false); commit(); }
              e.preventDefault();
            }
            else if (e.key === "Escape" && open) { setOpen(false); setText(value ?? ""); e.stopPropagation(); }
          }}
        />
        {filterable && (
          <button type="button" aria-expanded={showFilters} aria-controls={`${id}-filters`} onClick={() => setShowFilters((v) => !v)} title="Filter by continent, country or state">
            Filter{activeCount ? ` (${activeCount})` : ""}
          </button>
        )}
        {!hidePick && <button type="button" aria-pressed={picking} onClick={onPickMode} title="Click an airport on the map to set this end">Pick on map</button>}
      </div>
      {filterable && showFilters && (
        <div className="af-filters" id={`${id}-filters`} onMouseDown={(e) => e.preventDefault()} role="group" aria-label={`${label} airport filters`}>
          {facets.continents.length > 1 && (
            <div className="af-chips" role="group" aria-label="Continent">
              {chip("all-c", "Anywhere", !filter.continent, () => apply({}))}
              {facets.continents.map((c) => chip(c.key, `${c.label} (${c.count})`, filter.continent === c.key, () => apply({ continent: filter.continent === c.key ? null : (c.key as Continent) })))}
            </div>
          )}
          {facets.countries.length > 1 && (
            <div className="af-chips" role="group" aria-label="Country">
              {facets.countries.map((c) => chip(c.key, `${c.label} (${c.count})`, filter.country === c.key, () => apply({ continent: filter.continent ?? continentOf(c.key), country: filter.country === c.key ? null : c.key })))}
            </div>
          )}
          {facets.states.length > 1 && (
            <div className="af-chips" role="group" aria-label="State">
              {facets.states.map((s) => chip(s.key, `${s.label} (${s.count})`, filter.state === s.key, () => apply({ ...filter, country: "US", state: filter.state === s.key ? null : s.key })))}
            </div>
          )}
          {activeCount > 0 && <button type="button" className="af-clear" onClick={() => apply({})}>Clear filters</button>}
        </div>
      )}
      {open && options.length > 0 && (
        <ul className="af-list" id={listId} role="listbox" aria-label={`${label} suggestions`}>
          {options.map((a, i) => (
            <li key={a.id} id={`${id}-o-${a.id}`} role="option" aria-selected={i === idx} className={i === idx ? "sel" : ""} title={placeLabel(a)}
              ref={(el) => { if (el && i === idx) el.scrollIntoView({ block: "nearest" }); }}
              onMouseDown={(e) => { e.preventDefault(); choose(a.id); }} onMouseEnter={() => setIdx(i)}>
              <strong>{a.id}</strong><span>{a.city}</span><em>{a.name}{" · "}{regionName(a)}</em>
            </li>
          ))}
          {matches > options.length && <li className="af-more" role="presentation" aria-hidden="true">{matches - options.length} more, keep typing or add a filter</li>}
        </ul>
      )}
      {open && options.length === 0 && <div className="af-none" role="status">No airport matches{activeCount ? " these filters" : ""}.</div>}
      <div className="af-sub">{selected ? placeLabel(selected) : picking ? "Click an airport on the map." : " "}</div>
    </div>
  );
}
