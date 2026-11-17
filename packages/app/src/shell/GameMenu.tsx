import { useEffect, useRef, useState } from "react";
import { bridge } from "../sim/useSim";
import { useUi } from "../store";
import { useToasts } from "../routes/store";
import { saveToSlot } from "../save/saves";
import { quickSave } from "../save/SaveUi";

/**
 * "Game" menu in the top bar: the visible way to save, load and leave a game (Ctrl+S and the command palette still work).
 * Quit to main menu pauses, writes the autosave (same rules as the autosave hook: not after bankruptcy or during the
 * campaign review) and opens the start screen, whose Continue button brings the game back.
 */
export function GameMenu() {
  const [open, setOpen] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const setDialog = useUi((s) => s.setSaveDialog);
  const setStart = useUi((s) => s.setStartOpen);
  const push = useToasts((s) => s.push);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) { setOpen(false); setConfirmQuit(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); setConfirmQuit(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);

  const close = () => { setOpen(false); setConfirmQuit(false); };
  const quit = async () => {
    bridge.setSpeed(0);
    const s = bridge.getState();
    if (!s.credit?.bankrupt && !s.review) {
      const o = await saveToSlot(bridge, "auto");
      if (!o.ok) { push("alert", `Autosave failed, so the game was not closed: ${o.message}`); close(); return; }
    }
    close();
    setStart(true);
  };

  return (
    <div className="game-menu" ref={wrap}>
      <button className="pill-btn game-menu-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>Game</button>
      {open && (
        <div className="game-menu-list" role="menu" aria-label="Game">
          <button role="menuitem" onClick={() => { close(); void quickSave(); }}>Quick save <kbd>Ctrl+S</kbd></button>
          <button role="menuitem" onClick={() => { close(); setDialog("save"); }}>Save to a slot or file…</button>
          <button role="menuitem" onClick={() => { close(); setDialog("load"); }}>Load a game…</button>
          <hr />
          {confirmQuit ? (
            <div className="game-menu-confirm" role="group" aria-label="Quit to main menu">
              <span>The game is autosaved first. Continue on the main menu brings it back.</span>
              <div>
                <button className="primary" onClick={() => void quit()}>Quit to main menu</button>
                <button onClick={() => setConfirmQuit(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button role="menuitem" onClick={() => setConfirmQuit(true)}>Quit to main menu…</button>
          )}
        </div>
      )}
    </div>
  );
}
