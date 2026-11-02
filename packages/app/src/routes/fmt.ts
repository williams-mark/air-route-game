export const usd = (v: number): string => `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
export const usdSigned = (v: number): string => (v > 0 ? `+${usd(v)}` : usd(v));
export const pct = (v: number, digits = 0): string => `${(v * 100).toFixed(digits)}%`;
