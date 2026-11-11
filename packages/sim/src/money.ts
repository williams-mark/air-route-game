/** Money for player-facing messages: "$1.5M", "-$167.5M", "$2.55B" (never "$-167.5M" or "$2552.9M"). */
export function usdM(usd: number, digits = 1): string {
  if (Math.abs(usd) >= 1e9) {
    const b = usd / 1e9;
    const s = Math.abs(b).toFixed(2);
    return `${b < 0 && Number(s) !== 0 ? "-" : ""}$${s}B`;
  }
  const v = usd / 1e6;
  const s = Math.abs(v).toFixed(digits);
  return `${v < 0 && Number(s) !== 0 ? "-" : ""}$${s}M`;
}

/** "$450k" / "-$450k". */
export function usdK(usd: number): string {
  const k = Math.round(usd / 1000);
  return `${k < 0 ? "-" : ""}$${Math.abs(k)}k`;
}
