import { create } from "zustand";

const KEY = "arg-picker-memory";
function load(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
function save(m: Record<string, string>) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ } }

interface Memory { last: Record<string, string>; remember: (key: string, typeId: string) => void }
/** Last aircraft type the player chose per picker (order form, route sandbox, cabin designer, route swap). */
export const usePickerMemory = create<Memory>((set, get) => ({
  last: load(),
  remember: (key, typeId) => { const last = { ...get().last, [key]: typeId }; save(last); set({ last }); },
}));
