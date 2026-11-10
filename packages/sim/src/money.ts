/** Money for player-facing messages: "$1.5M", "-$167.5M" (never "$-167.5M"). */
export function usdM(usd: number, digits = 1): string {
  const v = usd / 1e6;
  const s = Math.abs(v).toFixed(digits);
  return `${v < 0 && Number(s) !== 0 ? "-" : ""}$${s}M`;
}

/** "$450k" / "-$450k". */
export function usdK(usd: number): string {
  const k = Math.round(usd / 1000);
  return `${k < 0 ? "-" : ""}$${Math.abs(k)}k`;
}
