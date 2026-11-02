import { useSimSelector } from "../sim/useSim";
import { formatDay } from "../sim/format";
import type { Severity } from "../sim/bridge";
import { useUi } from "../store";
import { IconAlert, IconChevron, IconGood, IconInfo, IconWarn } from "./icons";

const SEV: Record<Severity, { Icon: typeof IconInfo; label: string }> = {
  info: { Icon: IconInfo, label: "Info" },
  good: { Icon: IconGood, label: "Good news" },
  warn: { Icon: IconWarn, label: "Warning" },
  alert: { Icon: IconAlert, label: "Alert" },
};

export function EventFeed() {
  const notices = useSimSelector((s) => s.notices);
  const open = useUi((s) => s.feedOpen);
  const setOpen = useUi((s) => s.setFeedOpen);
  return (
    <section className={`feed ${open ? "open" : ""}`} aria-label="Event feed">
      <button className="feed-head" aria-expanded={open} aria-controls="feed-list" onClick={() => setOpen(!open)}>
        <span>Events</span>
        <span className="count">{notices.length}</span>
        <span className="chev"><IconChevron size={16} /></span>
      </button>
      {open && (
        <ul id="feed-list" className="feed-list">
          {notices.slice(0, 12).map((n) => {
            const { Icon, label } = SEV[n.severity];
            return (
              <li key={n.id} className={`sev-${n.severity}`}>
                <span className="sev-icon" role="img" aria-label={label}><Icon size={16} /></span>
                <span className="txt">{n.text}</span>
                <time>{formatDay(n.day).slice(4, -5)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
