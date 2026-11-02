import { useToasts } from "./store";
import { IconAlert, IconGood, IconInfo } from "../shell/icons";

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "alert" ? "alert" : "status"}>
          <span className="toast-ico" aria-hidden="true">{t.kind === "good" ? <IconGood size={18} /> : t.kind === "alert" ? <IconAlert size={18} /> : <IconInfo size={18} />}</span>
          <span className="toast-text">{t.text}</span>
          <button className="icon-btn toast-x" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>{"✕"}</button>
        </div>
      ))}
    </div>
  );
}
