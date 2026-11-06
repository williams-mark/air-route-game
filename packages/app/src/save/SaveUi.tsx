import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { airports } from "@arg/data";
import { hubCandidates, STARTING_AIRLINE } from "@arg/sim";
import { countryName } from "../routes/geoNames";
import { hubsByContinent, START_HUB_COUNT } from "./startHubs";
import { presetForAirport } from "../map/presets";
import { bridge } from "../sim/useSim";
import { formatDate, formatMoney } from "../sim/format";
import { useUi } from "../store";
import { useToasts } from "../routes/store";
import { exportToFile, importFromFile, latestSlot, loadFromSlot, parseSeed, saveToSlot, slotName, type Outcome } from "./saves";
import { ALL_SLOTS, getStore, MANUAL_SLOTS, type SlotId, type SlotMeta } from "./store";
import { Modal } from "../shell/Modal";
import "./save.css";

function useSlots() {
  const [metas, setMetas] = useState<SlotMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    getStore().list().then((m) => { setMetas(m); setError(null); }).catch((e) => { setMetas([]); setError(`Saved games are unavailable in this browser (${e instanceof Error ? e.message : String(e)}). You can still export to a file.`); });
  }, []);
  useEffect(refresh, [refresh]);
  return { metas, error, refresh };
}

const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); };

function SlotRow({ slot, meta, mode, busy, onSave, onLoad }: { slot: SlotId; meta?: SlotMeta; mode: "save" | "load"; busy: boolean; onSave?: () => void; onLoad: () => void }) {
  return (
    <li className="slot">
      <div className="slot-main">
        <strong>{slotName(slot)}</strong>
        {meta ? (
          <span className="slot-meta">{meta.airline} {"·"} {formatDate(meta.day)} {"·"} {formatMoney(meta.cash)} {"·"} seed {meta.seed} <em>saved {when(meta.savedAt)}</em></span>
        ) : (<span className="slot-meta empty">Empty</span>)}
      </div>
      {mode === "save" && slot !== "auto" && <button disabled={busy} onClick={onSave}>{meta ? "Overwrite" : "Save here"}</button>}
      {mode === "load" && <button disabled={busy || !meta} onClick={onLoad}>Load</button>}
    </li>
  );
}

function FileButtons({ onResult, importOnly }: { onResult: (o: Outcome) => void; importOnly?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="save-files">
      {!importOnly && <button onClick={() => onResult(exportToFile(bridge))}>Export to file</button>}
      <button onClick={() => input.current?.click()}>Import from file</button>
      <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Import save file" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f) onResult(await importFromFile(bridge, f));
      }} />
    </div>
  );
}

export function SaveDialog() {
  const mode = useUi((s) => s.saveDialog)!;
  const setDialog = useUi((s) => s.setSaveDialog);
  const push = useToasts((s) => s.push);
  const { metas, error, refresh } = useSlots();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Outcome | null>(null);
  const close = () => setDialog(null);
  const byslot = new Map((metas ?? []).map((m) => [m.slot, m]));

  const finish = (o: Outcome, closeOnOk: boolean) => {
    setMsg(o);
    if (o.ok) { push("good", o.message); if (closeOnOk) close(); } else push("alert", o.message);
  };
  const doSave = async (slot: SlotId) => {
    setBusy(true);
    const o = await saveToSlot(bridge, slot);
    if (o.ok) { try { localStorage.setItem("arg-lastslot", slot); } catch { /* ignore */ } }
    setBusy(false); refresh(); finish(o, false);
  };
  const doLoad = async (slot: SlotId) => { setBusy(true); const o = await loadFromSlot(bridge, slot); setBusy(false); finish(o, true); };

  return (
    <Modal label="Save and load" className="dialog save-dialog" onClose={close} initialFocus='button[aria-label="Close"]'>
        <div className="dialog-head">
          <div className="seg" role="tablist" aria-label="Save or load">
            {(["save", "load"] as const).map((m) => (<button key={m} role="tab" aria-selected={mode === m} aria-pressed={mode === m} onClick={() => { setDialog(m); setMsg(null); }}>{m === "save" ? "Save game" : "Load game"}</button>))}
          </div>
          <button className="icon-btn" aria-label="Close" onClick={close}>{"✕"}</button>
        </div>
        <div className="save-body">
          {error && <p className="save-msg bad" role="alert">{error}</p>}
          <ul className="slots" aria-label="Save slots">
            {ALL_SLOTS.filter((s) => mode === "load" || s !== "auto").map((s) => (
              <SlotRow key={s} slot={s} meta={byslot.get(s)} mode={mode} busy={busy || metas === null} onSave={() => doSave(s)} onLoad={() => doLoad(s)} />
            ))}
          </ul>
          <FileButtons onResult={(o) => finish(o, o.ok && mode === "load")} />
          <p className="save-note">Autosave happens on the first of each month and when you leave the tab. Ctrl+S saves to the last slot you used.</p>
          <p className={`save-msg ${msg && !msg.ok ? "bad" : ""}`} role="status" aria-live="polite">{msg?.message ?? ""}</p>
        </div>
    </Modal>
  );
}

/** Ctrl+S: save to the last manual slot used (default slot 1). */
export async function quickSave(): Promise<void> {
  let slot: SlotId = "1";
  try { const s = localStorage.getItem("arg-lastslot") as SlotId | null; if (s && MANUAL_SLOTS.includes(s)) slot = s; } catch { /* ignore */ }
  const o = await saveToSlot(bridge, slot);
  useToasts.getState().push(o.ok ? "good" : "alert", o.ok ? `Quick saved to ${slotName(slot)}.` : o.message);
}

export function StartScreen() {
  const setStart = useUi((s) => s.setStartOpen);
  const setDialog = useUi((s) => s.setSaveDialog);
  const push = useToasts((s) => s.push);
  const { metas, error } = useSlots();
  const [seed, setSeed] = useState("2015");
  const [hub, setHub] = useState("LAX");
  const [airline, setAirline] = useState("");
  const hubs = useMemo(() => hubCandidates(airports, START_HUB_COUNT), []);
  const hubGroups = useMemo(() => hubsByContinent(hubs), [hubs]);
  const [msg, setMsg] = useState<Outcome | null>(null);
  const [showLoad, setShowLoad] = useState(false);
  const latest = metas ? latestSlot(metas) : null;

  const begin = (o: Outcome) => { setMsg(o); if (o.ok) { setStart(false); setDialog(null); push("good", o.message); } };
  const parsed = parseSeed(seed);
  const [slotBusy, setSlotBusy] = useState(false);
  return (
    <Modal label="Start screen" scrimClassName="start" className="start-card" initialFocus="#start-seed" closeOnEscape={false} closeOnBackdrop={false} onClose={() => undefined}>
      <>
        <h1>Air Route Game</h1>
        <p className="start-sub">Build an airline anywhere in the world, 2015 to 2025.</p>
        {latest ? (
          <button className="start-primary" disabled={slotBusy} onClick={async () => { setSlotBusy(true); begin(await loadFromSlot(bridge, latest.slot)); setSlotBusy(false); }}>
            <strong>Continue</strong>
            <span>{latest.airline} {"·"} {formatDate(latest.day)} {"·"} {slotName(latest.slot)}</span>
          </button>
        ) : (<p className="start-none">{metas === null ? "Looking for saved games…" : "No saved game yet."}</p>)}
        <form className="start-new" onSubmit={(e) => { e.preventDefault(); if (parsed === null) { setMsg({ ok: false, message: "Seed must be a whole number from 0 to 999999999." }); return; } bridge.newGame?.(parsed, { hub, name: airline }); const home = airports.find((x) => x.id === hub); if (home && hub !== "LAX") useUi.getState().flyTo(presetForAirport(home)); begin({ ok: true, message: `New game, seed ${parsed}, ${airline.trim() || STARTING_AIRLINE} at ${hub}.` }); }}>
          <label htmlFor="start-airline">Airline name</label>
          <input id="start-airline" className="wide" maxLength={40} value={airline} placeholder={STARTING_AIRLINE} onChange={(e) => setAirline(e.target.value)} />
          <label htmlFor="start-hub">Home airport</label>
          <select id="start-hub" value={hub} onChange={(e) => setHub(e.target.value)}>
            {hubGroups.map((g) => (
              <optgroup key={g.continent} label={g.continent}>
                {g.hubs.map((h) => (
                  <option key={h.id} value={h.id}>{h.id} {"·"} {h.city}{h.country === "US" ? `, ${h.region}` : `, ${countryName(h.country)}`}{h.id === "LAX" ? " (default)" : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <label htmlFor="start-seed">Seed</label>
          <input id="start-seed" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value)} aria-invalid={parsed === null} />
          <button type="submit" className="primary">New game</button>
        </form>
        <p className="start-hint">You start with a few aircraft and routes that suit the home airport.</p>
        <p className="start-hint">The same seed always gives the same world and the same rivals.</p>
        <div className="start-row">
          <button aria-expanded={showLoad} onClick={() => setShowLoad((v) => !v)}>Load slot</button>
          <FileButtons importOnly onResult={begin} />
        </div>
        {showLoad && (
          <ul className="slots" aria-label="Save slots">
            {ALL_SLOTS.map((s) => (<SlotRow key={s} slot={s} meta={(metas ?? []).find((m) => m.slot === s)} mode="load" busy={slotBusy} onLoad={async () => { setSlotBusy(true); begin(await loadFromSlot(bridge, s)); setSlotBusy(false); }} />))}
          </ul>
        )}
        {error && <p className="save-msg bad" role="alert">{error}</p>}
        <p className={`save-msg ${msg && !msg.ok ? "bad" : ""}`} role="status" aria-live="polite">{msg?.message ?? ""}</p>
      </>
    </Modal>
  );
}
