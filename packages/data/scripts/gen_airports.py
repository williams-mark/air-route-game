#!/usr/bin/env python3
"""Generate src/airports.ts from OurAirports CSVs plus the hand-maintained table below.

Usage: python3 -I scripts/gen_airports.py <airports.csv> <runways.csv> > src/airports.ts
The first rows are the hand-curated CA/HI/OR/WA table T below (unchanged since lane/orwa). World rows (rest of the US, Europe) come from
world_airports_us.tsv / world_airports_eu.tsv plus the formulas and country tables below; see SOURCES.md "World expansion".
Sourced fields (OurAirports, public domain): name, lat, lon, runwayM.
Estimated fields: metroPopulation, gdpPerCapita, tourismIndex, slotsPerHour (see SOURCES.md).
"""
import csv, math, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")

# iata: (city, region, short name, metroPopulation, gdpPerCapita, tourismIndex, slotsPerHour)
T = {
 # California
 "LAX": ("Los Angeles","CA","Los Angeles Intl",13_300_000,70000,0.75,100),
 "SFO": ("San Francisco","CA","San Francisco Intl",4_650_000,93000,0.80,60),
 "SAN": ("San Diego","CA","San Diego Intl",3_300_000,67000,0.70,45),
 "SJC": ("San Jose","CA","Norman Y. Mineta San Jose Intl",1_980_000,116000,0.35,40),
 "OAK": ("Oakland","CA","Oakland Intl",2_700_000,80000,0.40,45),
 "SMF": ("Sacramento","CA","Sacramento Intl",2_280_000,50000,0.30,40),
 "BUR": ("Burbank","CA","Hollywood Burbank",1_800_000,70000,0.45,25),
 "LGB": ("Long Beach","CA","Long Beach (Daugherty Field)",1_500_000,70000,0.45,25),
 "SNA": ("Santa Ana","CA","John Wayne Orange County",3_170_000,78000,0.50,20),
 "ONT": ("Ontario","CA","Ontario Intl",4_450_000,38000,0.25,50),
 "PSP": ("Palm Springs","CA","Palm Springs Intl",450_000,45000,0.80,20),
 "SBA": ("Santa Barbara","CA","Santa Barbara Municipal",445_000,60000,0.65,20),
 "FAT": ("Fresno","CA","Fresno Yosemite Intl",970_000,40000,0.35,25),
 "MRY": ("Monterey","CA","Monterey Regional",433_000,52000,0.80,15),
 "SBP": ("San Luis Obispo","CA","San Luis Obispo County Regional",282_000,50000,0.50,12),
 "SMX": ("Santa Maria","CA","Santa Maria Public",200_000,45000,0.15,10),
 "STS": ("Santa Rosa","CA","Charles M. Schulz Sonoma County",502_000,55000,0.55,10),
 "RDD": ("Redding","CA","Redding Regional",179_000,40000,0.30,8),
 "ACV": ("Arcata/Eureka","CA","California Redwood Coast-Humboldt County",135_000,40000,0.40,8),
 "CEC": ("Crescent City","CA","Del Norte County (Jack McNamara Field)",27_000,33000,0.30,5),
 "BFL": ("Bakersfield","CA","Meadows Field",884_000,40000,0.15,12),
 "SCK": ("Stockton","CA","Stockton Metropolitan",726_000,40000,0.10,10),
 "MCE": ("Merced","CA","Merced Regional (Macready Field)",266_000,33000,0.35,6),
 "IPL": ("Imperial","CA","Imperial County",180_000,38000,0.10,6),
 "MMH": ("Mammoth Lakes","CA","Mammoth Yosemite",14_000,55000,0.75,8),
 "BIH": ("Bishop","CA","Eastern Sierra Regional",18_000,50000,0.50,6),
 "CCR": ("Concord","CA","Buchanan Field",1_120_000,80000,0.20,8),
 "VIS": ("Visalia","CA","Visalia Municipal",459_000,42000,0.10,6),
 "CLD": ("Carlsbad","CA","McClellan-Palomar",1_000_000,67000,0.45,10),
 "SBD": ("San Bernardino","CA","San Bernardino Intl",2_140_000,38000,0.20,15),
 # Hawaii
 "HNL": ("Honolulu","HI","Daniel K. Inouye Intl",992_000,62000,1.00,70),
 "OGG": ("Kahului","HI","Kahului",165_000,55000,0.95,35),
 "KOA": ("Kailua-Kona","HI","Ellison Onizuka Kona Intl",110_000,40000,0.85,20),
 "LIH": ("Lihue","HI","Lihue",71_000,50000,0.90,20),
 "ITO": ("Hilo","HI","Hilo Intl",85_000,40000,0.50,15),
 "MKK": ("Kaunakakai","HI","Molokai",7_300,35000,0.35,8),
 "LNY": ("Lanai City","HI","Lanai",3_100,35000,0.60,6),
 "JHM": ("Lahaina","HI","Kapalua",22_000,55000,0.70,8),
 "HNM": ("Hana","HI","Hana",1_200,35000,0.50,4),
 "LUP": ("Kalaupapa","HI","Kalaupapa",90,30000,0.20,4),
 "JRF": ("Kapolei","HI","Kalaeloa (John Rodgers Field)",992_000,61000,0.20,6),
 "MUE": ("Waimea","HI","Waimea-Kohala",10_000,40000,0.30,4),
 # Oregon
 "PDX": ("Portland","OR","Portland Intl",2_390_000,54000,0.45,60),
 "EUG": ("Eugene","OR","Eugene (Mahlon Sweet Field)",360_000,46000,0.40,20),
 "MFR": ("Medford","OR","Rogue Valley Intl-Medford",300_000,42000,0.40,15),
 "RDM": ("Redmond","OR","Roberts Field (Redmond/Bend)",200_000,50000,0.60,12),
 "SLE": ("Salem","OR","Salem-Willamette Valley (McNary Field)",410_000,42000,0.15,10),
 "OTH": ("North Bend","OR","Southwest Oregon Regional",63_000,38000,0.40,6),
 "LMT": ("Klamath Falls","OR","Crater Lake-Klamath Regional",66_000,37000,0.25,5),
 "PDT": ("Pendleton","OR","Eastern Oregon Regional",76_000,40000,0.15,4),
 # Washington
 "SEA": ("Seattle","WA","Seattle-Tacoma Intl",3_733_000,85000,0.55,75),
 "BFI": ("Seattle","WA","Boeing Field (King County Intl)",2_120_000,85000,0.30,15),
 "PAE": ("Everett","WA","Paine Field (Snohomish County)",780_000,70000,0.30,20),
 "GEG": ("Spokane","WA","Spokane Intl",680_000,45000,0.25,30),
 "BLI": ("Bellingham","WA","Bellingham Intl",216_000,45000,0.40,15),
 "PSC": ("Pasco","WA","Tri-Cities",280_000,50000,0.15,12),
 "YKM": ("Yakima","WA","Yakima Air Terminal (McAllister Field)",250_000,38000,0.15,8),
 "EAT": ("Wenatchee","WA","Pangborn Memorial",115_000,48000,0.35,6),
 "ALW": ("Walla Walla","WA","Walla Walla Regional",65_000,45000,0.30,5),
 "PUW": ("Pullman","WA","Pullman-Moscow Regional",86_000,40000,0.10,5),
}


rows_all = list(csv.DictReader(open(sys.argv[1], encoding="utf-8")))
by_iata = defaultdict(list)
by_ident = {}
for r in rows_all:
    by_ident[r["ident"]] = r
    if r["iata_code"]: by_iata[r["iata_code"]].append(r)
ap = {}
for k in T:
    for r in by_iata[k]:
        if r["iso_region"] in ("US-CA","US-HI","US-OR","US-WA"): ap[k] = r
longest = {}      # ident -> longest non-closed runway, ft
longest_any = {}  # ident -> longest runway incl. closed (only used for airports flagged X: closed since 2015)
for r in csv.DictReader(open(sys.argv[2], encoding="utf-8")):
    if not r["length_ft"]: continue
    ident = r["airport_ident"]; L = int(r["length_ft"])
    longest_any[ident] = max(longest_any.get(ident, 0), L)
    if r["closed"] == "1": continue
    longest[ident] = max(longest.get(ident, 0), L)

missing = set(T) - set(ap)
assert not missing, missing

# ---------------------------------------------------------------------------------------------------------------------------
# World expansion (rest of the US and Europe). Constants documented in SOURCES.md "World expansion".
# Country GDP per capita 2015, current USD, rounded to 100. RECALLED from World Bank NY.GDP.PCAP.CD (API unreachable from the build
# sandbox, so NOT fetched: spot-check before relying on them).
COUNTRY_GDP = {
 "US":56800, "GB":44600, "IE":61900, "FR":36500, "DE":41200, "NL":44300, "BE":41000, "LU":101400, "CH":82800, "AT":44200,
 "IT":30200, "ES":25700, "PT":19200, "DK":53000, "SE":51000, "NO":74000, "FI":43000, "IS":52000, "PL":12500, "CZ":17700,
 "SK":16500, "HU":12700, "RO":8900, "BG":7500, "SI":21300, "HR":12300, "GR":18100, "CY":22900, "MT":25000, "EE":17500,
 "LV":14000, "LT":14300, "RS":5200, "BA":4200, "ME":6500, "MK":5200, "AL":3900, "XK":3700, "JE":57000, "GG":57000, "IM":57000,
}
# Baseline tourism index by country (ESTIMATE, 0..1): share of leisure/visitor-driven demand for an average airport there.
COUNTRY_TOUR = {
 "US":0.15, "GB":0.25, "IE":0.35, "FR":0.40, "DE":0.20, "NL":0.20, "BE":0.15, "LU":0.10, "CH":0.30, "AT":0.35,
 "IT":0.50, "ES":0.55, "PT":0.45, "DK":0.20, "SE":0.15, "NO":0.20, "FI":0.15, "IS":0.45, "PL":0.15, "CZ":0.20,
 "SK":0.15, "HU":0.25, "RO":0.15, "BG":0.30, "SI":0.30, "HR":0.55, "GR":0.55, "CY":0.55, "MT":0.60, "EE":0.20,
 "LV":0.15, "LT":0.15, "RS":0.15, "BA":0.20, "ME":0.45, "MK":0.15, "AL":0.30, "XK":0.10, "JE":0.40, "GG":0.40, "IM":0.40,
}
TOUR_R, TOUR_C = 0.35, 0.25  # added for flag R (resort/leisure) and C (major tourist city)
US_STATES = set("DC AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())

def rnd(x, step=1):
    return int(math.floor(x / step + 0.5)) * step

def est_pop(pax_m):  # people; metro population implied by annual passengers (ESTIMATE)
    return min(25_000_000, max(20_000, rnd(600_000 * pax_m ** 0.75, 5000)))

def est_gdp(country, pop):  # USD per head
    mult = min(1.35, max(0.80, 0.85 + 0.20 * math.log10(pop / 1e6)))
    return rnd(COUNTRY_GDP[country] * mult, 1000)

def est_tour(country, flags):
    t = COUNTRY_TOUR[country] + (TOUR_R if "R" in flags else 0) + (TOUR_C if "C" in flags else 0)
    return min(0.9, max(0.05, rnd(t, 0.05)))

def est_slots(pax_m):  # movements per hour the airport can be given to airlines (ESTIMATE)
    return min(120, max(4, rnd(11 * math.sqrt(pax_m))))

# Landmass convention (SOURCES.md): US-CONUS, US-AK, US-HI (Hawaii islands handled in geo.ts); Europe: EU-MAINLAND = continental Europe
# incl. Scandinavia, Finland, the Baltics, the Danish islands joined by bridges (Zealand, Funen), and the Balkans; Great Britain = GB;
# island of Ireland (Republic + Northern Ireland) = IE; Iceland = IS; Cyprus = CY; Malta = MT; Crown Dependencies JE/GG/IM; every other
# island with an airport is its own landmass "<ISO country>-<Island>".
ISLAND = {
 "BFS":"IE","BHD":"IE",
 "KOI":"GB-Orkney","LSI":"GB-Shetland","SYY":"GB-Hebrides",
 "BIA":"FR-Corsica","AJA":"FR-Corsica","FSC":"FR-Corsica","CLY":"FR-Corsica",
 "PMI":"ES-Mallorca","IBZ":"ES-Ibiza","MAH":"ES-Menorca",
 "TFS":"ES-Tenerife","TFN":"ES-Tenerife","LPA":"ES-GranCanaria","ACE":"ES-Lanzarote","FUE":"ES-Fuerteventura","SPC":"ES-LaPalma",
 "CTA":"IT-Sicily","PMO":"IT-Sicily","TPS":"IT-Sicily","CIY":"IT-Sicily","CAG":"IT-Sardinia","OLB":"IT-Sardinia","AHO":"IT-Sardinia",
 "HER":"GR-Crete","CHQ":"GR-Crete","RHO":"GR-Rhodes","CFU":"GR-Corfu","KGS":"GR-Kos","JTR":"GR-Santorini","ZTH":"GR-Zakynthos",
 "JMK":"GR-Mykonos","EFL":"GR-Kefalonia","MJT":"GR-Lesbos","SMI":"GR-Samos","JSI":"GR-Skiathos",
 "FNC":"PT-Madeira","RNN":"DK-Bornholm","VBY":"SE-Gotland",
}
SINGLE = {"IE","IS","CY","MT","JE","GG","IM"}  # whole country is one landmass named by its code
def landmass_of(iata, country, region):
    if country == "US": return {"AK":"US-AK","HI":"US-HI"}.get(region, "US-CONUS")
    if iata in ISLAND: return ISLAND[iata]
    if country in SINGLE: return country
    if country == "GB": return "GB"
    return "EU-MAINLAND"

# OurAirports renames/closed records where the current name would be wrong for the 2015 campaign start.
NAME_OVERRIDE = {"PBI":"Palm Beach Intl", "TXL":"Berlin Tegel", "SXF":"Berlin Schönefeld", "MJV":"Murcia San Javier",
 "MSP":"Minneapolis-St. Paul Intl", "LIT":"Little Rock National (Adams Field)", "FNC":"Madeira (Funchal)", "TGD":"Podgorica",
 "FCO":"Rome Fiumicino", "BSL":"EuroAirport Basel-Mulhouse", "CTA":"Catania Fontanarossa", "PMO":"Palermo Falcone-Borsellino",
 "FLR":"Florence Peretola", "BGO":"Bergen Flesland", "SVG":"Stavanger Sola", "TRD":"Trondheim Vaernes", "TRF":"Sandefjord Torp",
 "RYG":"Moss Rygge", "KRS":"Kristiansand Kjevik", "HAU":"Haugesund Karmoy", "MOL":"Molde Aro", "KKN":"Kirkenes Hoybuktmoen",
 "KSU":"Kristiansund Kvernberget", "BDU":"Bardufoss", "RZE":"Rzeszow-Jasionka", "SZZ":"Szczecin-Goleniow", "BZG":"Bydgoszcz",
 "SBZ":"Sibiu Intl"}

def clean_name(n):
    n = n.replace(" airport", " Airport")
    for a, b in ((" International Airport"," Intl"),(" Intl. Airport"," Intl"),(" Airport",""),(" International"," Intl"),("Aeropuerto de ",""),("Aeroporto ",""),("Aéroport ",""),('"',"'")):
        n = n.replace(a, b)
    return n.strip()

CANDIDATE_TYPES = ("large_airport", "medium_airport", "small_airport")
def find(iata, ident=None):
    if ident: return by_ident[ident]
    c = [r for r in by_iata[iata] if r["type"] in CANDIDATE_TYPES and r["scheduled_service"] == "yes"] or [r for r in by_iata[iata] if r["type"] in CANDIDATE_TYPES]
    if len(c) != 1:
        problems.append((iata, [(r["ident"], r["iso_country"], r["type"]) for r in by_iata[iata]]))
        return None
    return c[0]

problems = []
world = []  # (iata, row dict)
dropped = []
seen = set(T)
for fn in ("world_airports_us.tsv", "world_airports_eu.tsv"):
    for line in open(os.path.join(HERE, fn), encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip() or line.startswith("#"): continue
        f = (line.split("|") + [""] * 7)[:7]
        iata, pax, flags, pop, gdp, city, ident = f
        assert iata not in seen, ("duplicate", iata); seen.add(iata)
        r = find(iata, ident or None)
        if r is None: continue
        lat, lon = float(r["latitude_deg"]), float(r["longitude_deg"])
        ft = (longest_any if "X" in flags else longest).get(r["ident"], 0)
        if not ft: dropped.append((iata, "no runway length")); continue
        rwm = round(ft * 0.3048)
        if r["iso_country"] == "US":
            region = r["iso_region"][3:]; assert region in US_STATES, (iata, region)
        else:
            region = r["iso_country"]
        country = r["iso_country"]
        assert country in COUNTRY_GDP, (iata, country)
        paxm = int(pax) / 1000.0
        popv = int(pop) if pop else est_pop(paxm)
        gdpv = int(gdp) if gdp else est_gdp(country, popv)
        world.append(dict(id=iata, name=NAME_OVERRIDE.get(iata) or clean_name(r["name"]), city=(city or r["municipality"]), lat=lat, lon=lon, region=region, country=country,
                          landmass=landmass_of(iata, country, region), runwayM=rwm, paxk=int(pax), flags=flags, ident=r["ident"], ft=ft, popsrc="recalled" if pop else "formula", gdpsrc="recalled" if gdp else "formula", pop=popv, gdp=gdpv, tour=est_tour(country, flags), slots=est_slots(paxm)))
for d in dropped: print("// DROPPED", d, file=sys.stderr)
assert not problems, problems

print("// GENERATED by scripts/gen_airports.py from OurAirports (public domain) plus estimates. Do not edit by hand.")
print("// Sourced: id, lat, lon, runwayM. Estimated (see SOURCES.md): metroPopulation, gdpPerCapita, tourismIndex, slotsPerHour.")
print('import type { Airport } from "@arg/contracts";\n')
print("export const airports: Airport[] = [")
for k,(city,reg,name,pop,gdp,tour,slots) in T.items():
    r = ap[k]
    assert r["iso_region"] == "US-"+reg
    rw = round(longest[r["ident"]]*0.3048)
    print(f'  {{ id: "{k}", name: "{name}", city: "{city}", lat: {float(r["latitude_deg"]):.4f}, lon: {float(r["longitude_deg"]):.4f}, region: "{reg}", country: "US", landmass: "{"US-HI" if reg=="HI" else "US-CONUS"}", runwayM: {rw}, metroPopulation: {pop}, gdpPerCapita: {gdp}, tourismIndex: {tour}, slotsPerHour: {slots} }},')
for d in world:
    print(f'  {{ id: "{d["id"]}", name: "{d["name"]}", city: "{d["city"]}", lat: {d["lat"]:.4f}, lon: {d["lon"]:.4f}, region: "{d["region"]}", country: "{d["country"]}", landmass: "{d["landmass"]}", runwayM: {d["runwayM"]}, metroPopulation: {d["pop"]}, gdpPerCapita: {d["gdp"]}, tourismIndex: {d["tour"]:g}, slotsPerHour: {d["slots"]} }},')
print("];")

# Optional: refresh the evidence table inside SOURCES.md (argv[3]) between the WORLD-TABLE markers.
if len(sys.argv) > 3:
    lines = ["| id | place | landmass | pax 2015 (k, recalled) | flags | OurAirports ident | longest runway ft | metroPop | GDP/cap |", "|---|---|---|---|---|---|---|---|---|"]
    for d in world:
        lines.append(f'| {d["id"]} | {d["city"]}, {d["region"]} | {d["landmass"]} | {d["paxk"]} | {d["flags"] or "-"} | {d["ident"]} | {d["ft"]} | {d["popsrc"]} | {d["gdpsrc"]} |')
    doc = open(sys.argv[3], encoding="utf-8").read()
    a, b = doc.index("<!-- WORLD-TABLE-START -->"), doc.index("<!-- WORLD-TABLE-END -->")
    open(sys.argv[3], "w", encoding="utf-8").write(doc[:a] + "<!-- WORLD-TABLE-START -->\n" + "\n".join(lines) + "\n" + doc[b:])
