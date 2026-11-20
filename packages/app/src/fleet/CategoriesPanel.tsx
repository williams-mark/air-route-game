import { useState } from "react";
import { categoryBlockHours, type AircraftCategory, type SimState } from "@arg/sim";
import { shortTypeLabel } from "../aircraft/names";
import { bridge } from "../sim/useSim";
import { useToasts } from "../routes/store";
import { byName } from "./categories";
import type { HubFilter } from "./typeTable";

const hours = (h: number) => Math.round(h).toLocaleString("en-US");

/**
 * Aircraft categories: groups of aircraft that routes can be assigned to instead of one type (like fare policies, for aircraft).
 * Aircraft join by type automatically ("automatic types") or one by one from the Fleet table's selection bar.
 */
export function CategoriesPanel({ sim, hub = "all", categories, members, ownedTypeIds, onChanged }: {
  sim: SimState | null;
  /** Fleet hub filter: aircraft counts (`members`) and block hours are for this hub only. */
  hub?: HubFilter;
  categories: AircraftCategory[]; members: ReadonlyMap<string, number>; ownedTypeIds: string[]; onChanged: () => void;
}) {
  const push = useToasts((s) => s.push);
  // Open by default; the player can fold it away for the session.
  const [open, setOpen] = useState(true);
  const at = hub === "all" ? undefined : hub;
  const [name, setName] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTypes, setEditTypes] = useState<string[]>([]);
  const typeOptions = [...new Set([...ownedTypeIds, ...categories.flatMap((c) => c.autoTypeIds)])].sort((a, b) => byName(shortTypeLabel(a), shortTypeLabel(b)));
  const run = (cmd: Parameters<typeof bridge.dispatch>[0], good: string) => {
    const res = bridge.dispatch(cmd);
    if (res && !res.ok) { push("alert", res.error.message); return false; }
    push("good", good); onChanged(); return true;
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const TypeChips = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
    <div className="cat-types" role="group" aria-label="Automatic types">
      {typeOptions.length === 0 && <span className="hint">No aircraft types owned yet.</span>}
      {typeOptions.map((t) => (
        <label key={t} className={`cat-chip${value.includes(t) ? " on" : ""}`}>
          <input type="checkbox" checked={value.includes(t)} onChange={() => onChange(toggle(value, t))} />{shortTypeLabel(t)}
        </label>
      ))}
    </div>
  );
  return (
    <details className="panel-box cat-panel" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary><strong>Aircraft categories</strong> <span className="hint">({categories.length}) · assign routes to a group of aircraft instead of one type</span></summary>
      <p className="hint">A route assigned to a category can be flown by any of its aircraft based at either end. Each month the scheduler ranks the category's routes by demand per departure and gives the busiest routes the largest aircraft first; routes only trade places when the lower one has clearly more demand (over 12%) and the swap earns more. Aircraft of an automatic type join by themselves; use the selection bar in the table below to place single aircraft (for example a sub-fleet with its own cabin).</p>
      {categories.length > 0 && (
        <table className="data cat-table">
          <thead><tr><th scope="col">Category</th><th scope="col">Aircraft{at ? ` at ${at}` : ""}</th><th scope="col">Automatic types</th><th scope="col">Block h / wk{at ? ` at ${at}` : ""} (used / available)</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {categories.map((c) => {
              const h = sim ? categoryBlockHours(sim, c.id, at) : { used: 0, available: 0, free: 0 };
              return editing === c.id ? (
                <tr key={c.id}>
                  <td><input aria-label="Category name" value={editName} maxLength={40} onChange={(e) => setEditName(e.target.value)} /></td>
                  <td>{members.get(c.id) ?? 0}</td>
                  <td colSpan={2}><TypeChips value={editTypes} onChange={setEditTypes} /></td>
                  <td className="cat-actions">
                    <button type="button" className="primary" onClick={() => { if (run({ kind: "updateCategory", categoryId: c.id, name: editName, autoTypeIds: editTypes }, `Category "${editName.trim()}" saved.`)) setEditing(null); }}>Save</button>
                    <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <td>{members.get(c.id) ?? 0}</td>
                  <td>{c.autoTypeIds.length ? c.autoTypeIds.map(shortTypeLabel).sort(byName).join(", ") : <span className="hint">none</span>}</td>
                  <td className={h.free < 0 ? "neg" : undefined}>{hours(h.used)} / {hours(h.available)}</td>
                  <td className="cat-actions">
                    <button type="button" onClick={() => { setEditing(c.id); setEditName(c.name); setEditTypes(c.autoTypeIds); }}>Edit</button>
                    <button type="button" onClick={() => { if (window.confirm(`Delete "${c.name}"? Its routes go back to being flown by their own aircraft type.`)) run({ kind: "deleteCategory", categoryId: c.id }, `Category "${c.name}" deleted.`); }}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <form className="cat-new" onSubmit={(e) => { e.preventDefault(); if (run({ kind: "createCategory", name, autoTypeIds: types }, `Category "${name.trim()}" created.`)) { setName(""); setTypes([]); } }}>
        <label htmlFor="cat-name">New category</label>
        <input id="cat-name" value={name} maxLength={40} placeholder="e.g. Medium narrowbody" onChange={(e) => setName(e.target.value)} />
        <TypeChips value={types} onChange={setTypes} />
        <button type="submit" disabled={!name.trim()}>Create category</button>
      </form>
    </details>
  );
}

