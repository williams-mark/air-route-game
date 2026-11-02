import { useEffect, useMemo, useRef, useState } from "react";
import { setSpeed, togglePause } from "../sim/useSim";
import type { Speed } from "../sim/bridge";
import { useUi } from "../store";
import { useCreation } from "../routes/store";
import { PRESET_LABEL } from "../map/presets";
import type { CameraPresetId } from "../map/types";
import { VIEWS } from "./views";

interface Cmd { id: string; label: string; group: string; hint?: string; run: () => void }

function useCommands(): Cmd[] {
  const ui = useUi.getState;
  return useMemo(() => {
    const list: Cmd[] = VIEWS.map((v, i) => ({ id: `view-${v.id}`, label: `Go to ${v.label}`, group: "View", hint: `Alt+${i + 1}`, run: () => ui().setView(v.id) }));
    list.push(
      { id: "save", label: "Save game…", group: "Game", hint: "Ctrl+S", run: () => ui().setSaveDialog("save") },
      { id: "load", label: "Load game…", group: "Game", run: () => ui().setSaveDialog("load") },
    );
    list.push({ id: "new-route", label: "New route", group: "Routes", hint: "N", run: () => useCreation.getState().begin() });
    list.push({ id: "pause", label: "Pause / resume", group: "Game", hint: "Space", run: togglePause });
    for (const s of [1, 2, 3, 4, 5] as Speed[]) list.push({ id: `speed-${s}`, label: `Set speed ${s}`, group: "Game", hint: String(s), run: () => setSpeed(s) });
    for (const p of ["california", "hawaii", "both"] as CameraPresetId[]) {
      list.push({ id: `fly-${p}`, label: `Map: show ${PRESET_LABEL[p]}`, group: "Map", run: () => { ui().setView("map"); ui().flyTo(p); } });
    }
    list.push(
      { id: "competitors", label: "Toggle competitors on the map", group: "Map", run: () => { ui().setView("map"); ui().setShowCompetitors(!ui().showCompetitors); } },
      { id: "theme", label: "Toggle light / dark theme", group: "Interface", run: () => ui().setTheme(ui().theme === "dark" ? "light" : "dark") },
      { id: "feed", label: "Toggle event feed", group: "Interface", run: () => ui().setFeedOpen(!ui().feedOpen) },
      { id: "decisions", label: "Show pending decisions", group: "Interface", run: () => ui().unsnoozeAll() },
      { id: "help", label: "Keyboard shortcuts", group: "Interface", hint: "?", run: () => ui().setHelp(true) },
    );
    return list;
  }, [ui]);
}

export function CommandPalette() {
  const setPalette = useUi((s) => s.setPalette);
  const cmds = useCommands();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return cmds.filter((c) => terms.every((t) => `${c.label} ${c.group}`.toLowerCase().includes(t)));
  }, [q, cmds]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => prev?.focus?.();
  }, []);
  useEffect(() => { listRef.current?.children[idx]?.scrollIntoView({ block: "nearest" }); }, [idx]);

  const run = (c: Cmd | undefined) => { if (!c) return; setPalette(false); c.run(); };
  return (
    <div className="scrim top" onMouseDown={(e) => { if (e.target === e.currentTarget) setPalette(false); }}>
      <div className="dialog palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef} className="palette-input" placeholder="Type a command or view…" value={q} role="combobox" aria-expanded="true"
          aria-controls="palette-list" aria-activedescendant={filtered[idx] ? `cmd-${filtered[idx]!.id}` : undefined} aria-label="Search commands"
          onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { setIdx((i) => Math.min(filtered.length - 1, i + 1)); e.preventDefault(); }
            else if (e.key === "ArrowUp") { setIdx((i) => Math.max(0, i - 1)); e.preventDefault(); }
            else if (e.key === "Enter") { run(filtered[idx]); e.preventDefault(); }
            else if (e.key === "Escape") { setPalette(false); e.preventDefault(); }
          }}
        />
        <ul id="palette-list" ref={listRef} className="palette-list" role="listbox" aria-label="Commands">
          {filtered.map((c, i) => (
            <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === idx} className={i === idx ? "sel" : ""} onMouseMove={() => setIdx(i)} onClick={() => run(c)}>
              <span className="grp">{c.group}</span><span className="lbl">{c.label}</span>{c.hint && <kbd>{c.hint}</kbd>}
            </li>
          ))}
          {filtered.length === 0 && <li className="empty" role="presentation">No matching commands</li>}
        </ul>
      </div>
    </div>
  );
}
