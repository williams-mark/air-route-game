const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EPOCH_UTC = Date.UTC(2015, 0, 1);

/** Day 0 = Thu 1 Jan 2015. */
export function formatDay(day: number): string {
  const d = new Date(EPOCH_UTC + Math.floor(day) * 86_400_000);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatMoney(v: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(v);
  const s = abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(0)}K` : `${Math.round(abs)}`;
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  return `${sign}$${s}`;
}
