import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AircraftType, CabinLayout } from "@arg/contracts";
import { CabinEditor } from "./CabinEditor";
import { sameLayout, validateCabinLayout } from "@arg/sim";

interface Props {
  title: string;
  type: AircraftType;
  initial: CabinLayout;
  day: number;
  confirmLabel: string;
  /** Extra read-out in the footer (cost, downtime) for the current draft. */
  quote?: (layout: CabinLayout) => ReactNode;
  /** Return a message to block confirming (e.g. not enough cash). */
  blocker?: (layout: CabinLayout) => string | null;
  defaultRoute?: string;
  /** Refits: keep the confirm button disabled until the layout differs from `initial`. */
  requireChange?: boolean;
  onConfirm: (layout: CabinLayout) => void;
  onClose: () => void;
}

/** Modal wrapper around the editor: Escape cancels, focus returns to the opener. */
export function CabinDialog({ title, type, initial, day, confirmLabel, quote, blocker, defaultRoute, requireChange, onConfirm, onClose }: Props) {
  const [layout, setLayout] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, select")?.focus();
    return () => prev?.focus?.();
  }, []);
  const valid = validateCabinLayout(type, layout).ok;
  const unchanged = !!requireChange && sameLayout(initial, layout);
  const block = !valid ? "Fix the problems listed before confirming." : unchanged ? "Change the cabin before starting a refit." : blocker?.(layout) ?? null;
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref} className="dialog cabin-dialog" role="dialog" aria-modal="true" aria-label={title}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
      >
        <div className="dialog-head"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close cabin editor">Close</button></div>
        <div className="dialog-body"><CabinEditor type={type} layout={layout} onChange={setLayout} day={day} defaultRoute={defaultRoute} /></div>
        <div className="dialog-foot">
          <div className="quote" aria-live="polite">{quote?.(layout)}{block && <span className="neg"> {block}</span>}</div>
          <div>
            <button type="button" onClick={onClose}>Cancel</button>{" "}
            <button type="button" className="primary" disabled={!valid || !!block} onClick={() => onConfirm(layout)}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
