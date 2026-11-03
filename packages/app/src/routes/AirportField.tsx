import { useEffect, useId, useMemo, useState } from "react";
import { airports } from "@arg/data";
import { suggestAirports } from "./helpers";

const REGION_NAME = { CA: "California", HI: "Hawaii", OR: "Oregon", WA: "Washington" } as Record<string, string>;

interface Props {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  exclude?: string[];
  picking: boolean;
  onPickMode: () => void;
  autoFocus?: boolean;
}

/** IATA / city typeahead (ARIA combobox) with a "pick on map" toggle. */
export function AirportField({ label, value, onChange, exclude = [], picking, onPickMode, autoFocus }: Props) {
  const id = useId();
  const [text, setText] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setText(value ?? ""); }, [value]);
  const query = value && text === value ? "" : text;
  const options = useMemo(() => suggestAirports(query, airports, { limit: 7, exclude }), [query, exclude.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = value ? airports.find((a) => a.id === value) : undefined;

  const choose = (code: string) => { onChange(code); setText(code); setOpen(false); };
  const commit = () => {
    const exact = airports.find((a) => a.id.toLowerCase() === text.trim().toLowerCase() && !exclude.includes(a.id));
    if (exact) choose(exact.id);
    else setText(value ?? "");
  };
  const listId = `${id}-list`;
  return (
    <div className="rp-field airport-field">
      <label htmlFor={id}>{label}</label>
      <div className="af-row">
        <input
          id={id} type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" spellCheck={false}
          autoFocus={autoFocus} placeholder="IATA code or city" value={text} maxLength={24}
          aria-activedescendant={open && options[idx] ? `${id}-o-${options[idx]!.id}` : undefined}
          onChange={(e) => { setText(e.target.value); setOpen(true); setIdx(0); }}
          onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
          onBlur={() => { setOpen(false); commit(); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { setOpen(true); setIdx((i) => Math.min(options.length - 1, i + 1)); e.preventDefault(); }
            else if (e.key === "ArrowUp") { setIdx((i) => Math.max(0, i - 1)); e.preventDefault(); }
            else if (e.key === "Enter") { if (open && options[idx]) choose(options[idx]!.id); else commit(); e.preventDefault(); }
            else if (e.key === "Escape" && open) { setOpen(false); setText(value ?? ""); e.stopPropagation(); }
          }}
        />
        <button type="button" aria-pressed={picking} onClick={onPickMode} title="Click an airport on the map to set this end">Pick on map</button>
      </div>
      {open && options.length > 0 && (
        <ul className="af-list" id={listId} role="listbox" aria-label={`${label} suggestions`}>
          {options.map((a, i) => (
            <li key={a.id} id={`${id}-o-${a.id}`} role="option" aria-selected={i === idx} className={i === idx ? "sel" : ""}
              onMouseDown={(e) => { e.preventDefault(); choose(a.id); }} onMouseEnter={() => setIdx(i)}>
              <strong>{a.id}</strong><span>{a.city}</span><em>{a.name}</em>
            </li>
          ))}
        </ul>
      )}
      <div className="af-sub">{selected ? `${selected.name}, ${(REGION_NAME[selected.region] ?? selected.region)}` : picking ? "Click an airport on the map." : " "}</div>
    </div>
  );
}
