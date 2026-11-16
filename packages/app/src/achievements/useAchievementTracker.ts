import { useEffect } from "react";
import { getPlatform } from "../platform";
import { bridge } from "../sim/useSim";
import { useToasts } from "../routes/store";
import { useUi } from "../store";
import { installTracker } from "./store";

/** Mount once in the app shell: unlocks achievements as the game earns them. */
export function useAchievementTracker(): void {
  useEffect(() => installTracker({
    bridge,
    platform: getPlatform(),
    search: typeof location !== "undefined" ? location.search : "",
    startOpen: () => useUi.getState().startOpen,
    onStartOpenChange: (l) => useUi.subscribe((s, p) => { if (s.startOpen !== p.startOpen) l(); }),
    notify: (text) => useToasts.getState().push("good", text),
  }), []);
}
