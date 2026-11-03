// DEV ONLY. Fabricates a ~600 airport list for load-testing the map and pickers (open the app with ?stress=NNN).
// Geography and names come from OurAirports (public domain); every economic field is a made-up placeholder.
// Output src/dev/stress-airports.local.json is gitignored and never part of a build. Run:
//   node scripts/dev-stress-airports.mjs [path/to/airports.csv]   (downloads the CSV when no path is given)
import { readFileSync, writeFileSync } from "node:fs";

const URL_CSV = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv";
const src = process.argv[2];
const text = src ? readFileSync(src, "utf8") : await (await fetch(URL_CSV)).text();

function parseCsv(t) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  return rows;
}
const [head, ...rows] = parseCsv(text);
const col = Object.fromEntries(head.map((h, i) => [h, i]));
const EU = new Set("AL AD AT BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LT LU MT MD ME NL MK NO PL PT RO RS SK SI ES SE CH GB UA".split(" "));
const weight = { large_airport: 3, medium_airport: 2, small_airport: 1 };
const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const cands = rows.filter((r) => r.length > 10 && r[col.iata_code] && /^[A-Z]{3}$/.test(r[col.iata_code]) && r[col.scheduled_service] === "yes" && weight[r[col.type]])
  .filter((r) => r[col.iso_country] === "US" || EU.has(r[col.iso_country]));
const score = (r) => weight[r[col.type]] * 1000 + (hash(r[col.iata_code]) % 1000);
const pick = (pred, n) => cands.filter(pred).sort((a, b) => score(b) - score(a)).slice(0, n);
const chosen = [...pick((r) => r[col.iso_country] === "US", 330), ...pick((r) => r[col.iso_country] !== "US", 300)];
const seen = new Set();
const out = [];
for (const r of chosen) {
  const id = r[col.iata_code];
  if (seen.has(id)) continue; seen.add(id);
  const country = r[col.iso_country], us = country === "US";
  const lat = +r[col.latitude_deg], lon = +r[col.longitude_deg];
  const type = r[col.type], h = hash(id);
  const slots = type === "large_airport" ? 40 + (h % 60) : type === "medium_airport" ? 15 + (h % 20) : 4 + (h % 8);
  const region = us ? r[col.iso_region].replace("US-", "") : country;
  const landmass = us ? (region === "HI" ? "US-HI" : region === "AK" ? "US-AK" : region === "PR" ? "US-PR" : "US-CONUS") : country === "GB" ? "GB" : country === "IE" ? "IE" : "EU-MAINLAND";
  out.push({
    id, name: r[col.name], city: r[col.municipality] || r[col.name], lat, lon, region, country, landmass,
    runwayM: 2500, metroPopulation: Math.round(slots * 40_000), gdpPerCapita: 50000, tourismIndex: 0.3, slotsPerHour: slots,
  });
}
const file = new URL("../src/dev/stress-airports.local.json", import.meta.url);
writeFileSync(file, JSON.stringify(out));
const by = {}; out.forEach((a) => (by[a.country === "US" ? "US" : "EU"] = (by[a.country === "US" ? "US" : "EU"] ?? 0) + 1));
console.log(out.length, "airports", JSON.stringify(by), "->", file.pathname);
