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
# Globe expansion countries (lane/globe-data): same source/caveat as above, RECALLED approximate 2015 World Bank values, rounded to 100.
COUNTRY_GDP.update({
 "CA":43000, "MX":9400, "GT":3900, "SV":3900, "HN":2200, "NI":2000, "CR":11800, "PA":13000, "BZ":4800, "CU":7700, "DO":6700, "PR":28500,
 "VI":36000, "JM":4800, "BS":28000, "KY":61000, "BB":16000, "TT":17000, "AW":25000, "CW":21000, "BQ":20000, "SX":28000, "AG":14000,
 "KN":16000, "LC":8000, "GD":9500, "VC":7000, "GP":24000, "MQ":24000, "HT":800, "BM":98000, "TC":25000,
 "BR":8800, "AR":13700, "CO":6100, "PE":6200, "CL":13500, "EC":6200, "VE":10000, "UY":15500, "PY":5400, "BO":3100, "GY":4500, "SR":9000, "GF":17000,
 "EG":3500, "MA":2900, "TN":3700, "DZ":4200, "SD":1900, "ET":700, "KE":1400, "TZ":900, "UG":700, "RW":700, "DJ":1900, "NG":2700, "GH":1400,
 "SN":1000, "CI":1500, "CM":1300, "CD":450, "GA":7800, "ML":700, "AO":3500, "ZA":5700, "MZ":500, "ZW":1400, "ZM":1300, "BW":6300, "NA":4700,
 "MU":9200, "SC":14500, "MG":450, "RE":23000, "YT":9000, "CV":3100,
 "TR":9100, "IL":35700, "AE":38600, "QA":66000, "BH":23000, "KW":29000, "OM":16000, "SA":20800, "JO":4100, "LB":8000, "IQ":4800, "IR":5400,
 "AM":3500, "GE":3800, "AZ":5500, "KZ":10500, "UZ":2100, "KG":1200, "TM":6500, "AF":600,
 "IN":1600, "PK":1400, "BD":1200, "LK":3800, "NP":750, "MV":9000,
 "JP":34500, "KR":27200, "TW":22500, "CN":8100, "HK":42400, "MO":77000, "MN":3700,
 "TH":5800, "VN":2100, "SG":55600, "MY":9500, "BN":30900, "ID":3300, "PH":2900, "KH":1200, "LA":2400, "MM":1200, "TL":1300,
 "AU":56000, "NZ":38000, "FJ":5000, "PG":2400, "SB":1900, "VU":2700, "NC":38000, "PF":17000, "CK":15000, "WS":4000, "TO":4000, "GU":33000,
 "MP":20000, "PW":12000, "MH":3000, "KI":1700, "AS":11000,
})
# Baseline tourism index by country (ESTIMATE, 0..1): share of leisure/visitor-driven demand for an average airport there.
COUNTRY_TOUR = {
 "US":0.15, "GB":0.25, "IE":0.35, "FR":0.40, "DE":0.20, "NL":0.20, "BE":0.15, "LU":0.10, "CH":0.30, "AT":0.35,
 "IT":0.50, "ES":0.55, "PT":0.45, "DK":0.20, "SE":0.15, "NO":0.20, "FI":0.15, "IS":0.45, "PL":0.15, "CZ":0.20,
 "SK":0.15, "HU":0.25, "RO":0.15, "BG":0.30, "SI":0.30, "HR":0.55, "GR":0.55, "CY":0.55, "MT":0.60, "EE":0.20,
 "LV":0.15, "LT":0.15, "RS":0.15, "BA":0.20, "ME":0.45, "MK":0.15, "AL":0.30, "XK":0.10, "JE":0.40, "GG":0.40, "IM":0.40,
}
COUNTRY_TOUR_DEFAULT = 0.2  # globe expansion countries not listed below (ESTIMATE)
COUNTRY_TOUR.update({
 "CA":0.20, "MX":0.45, "CR":0.55, "PA":0.30, "BZ":0.60, "CU":0.55, "DO":0.65, "PR":0.50, "VI":0.70, "JM":0.65, "BS":0.75, "KY":0.80, "BB":0.70,
 "AW":0.80, "CW":0.60, "BQ":0.60, "SX":0.80, "AG":0.80, "KN":0.70, "LC":0.80, "GD":0.70, "GP":0.55, "MQ":0.55, "BM":0.70, "TC":0.85,
 "PE":0.40, "EC":0.35, "AR":0.30, "CL":0.30, "BR":0.30, "CO":0.25, "EG":0.55, "MA":0.55, "TN":0.55, "KE":0.35, "TZ":0.45, "ZA":0.35,
 "MU":0.80, "SC":0.85, "RE":0.50, "CV":0.70, "TR":0.50, "AE":0.45, "QA":0.25, "JO":0.40, "LB":0.35, "OM":0.35, "IL":0.35, "IN":0.20,
 "MV":0.90, "LK":0.45, "NP":0.50, "TH":0.55, "VN":0.40, "KH":0.50, "LA":0.45, "MY":0.35, "SG":0.40, "ID":0.35, "PH":0.35, "JP":0.30,
 "KR":0.25, "TW":0.30, "CN":0.15, "HK":0.45, "MO":0.65, "AU":0.30, "NZ":0.45, "FJ":0.80, "VU":0.75, "PF":0.85, "CK":0.85, "WS":0.60, "TO":0.50,
 "GU":0.70, "MP":0.70, "PW":0.75, "NC":0.55,
})
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
    t = COUNTRY_TOUR.get(country, COUNTRY_TOUR_DEFAULT) + (TOUR_R if "R" in flags else 0) + (TOUR_C if "C" in flags else 0)
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
# Globe expansion (lane/globe-data). One landmass per country by default (COUNTRY_LAND); continental blocks share a name (see SOURCES.md "Globe expansion").
# Islands are keyed by airport. Honshu, Shikoku and Kyushu are one landmass (bridges, tunnels, Shinkansen).
COUNTRY_LAND = {"CA":"CA", "MX":"MX", "GT":"NA-CENTRAL", "SV":"NA-CENTRAL", "HN":"NA-CENTRAL", "NI":"NA-CENTRAL", "CR":"NA-CENTRAL", "PA":"NA-CENTRAL", "BZ":"NA-CENTRAL",
 "CU":"CU", "DO":"DO-Hispaniola", "HT":"DO-Hispaniola", "PR":"PR", "JM":"JM", "KY":"KY", "BB":"BB", "AW":"AW", "CW":"CW", "BQ":"BQ", "AG":"AG", "KN":"KN", "LC":"LC", "GD":"GD",
 "GP":"GP", "MQ":"MQ", "BM":"BM", "TC":"TC",
 "BR":"SA-MAINLAND", "AR":"SA-MAINLAND", "CO":"SA-MAINLAND", "PE":"SA-MAINLAND", "CL":"SA-MAINLAND", "EC":"SA-MAINLAND", "VE":"SA-MAINLAND", "UY":"SA-MAINLAND",
 "PY":"SA-MAINLAND", "BO":"SA-MAINLAND", "GY":"SA-MAINLAND", "SR":"SA-MAINLAND", "GF":"SA-MAINLAND",
 "MG":"MG", "MU":"MU", "SC":"SC", "RE":"RE", "YT":"YT",
 "BH":"BH", "LK":"LK", "MV":"MV", "TW":"TW", "AU":"AU", "NC":"NC", "GU":"GU", "TL":"TL",
}
for _c in "EG MA TN DZ SD ET KE TZ UG RW DJ NG GH SN CI CM CD GA ML AO ZA MZ ZW ZM BW NA".split(): COUNTRY_LAND[_c] = "AF-MAINLAND"
for _c in ("TR IL AE QA KW OM SA JO LB IQ IR AM GE AZ KZ UZ KG TM AF IN PK BD NP BT KR CN HK MO MN TH VN SG KH LA MM MY").split(): COUNTRY_LAND[_c] = "AS-MAINLAND"
ISLAND.update({
 "STT":"VI-StThomas", "NAS":"BS-NewProvidence", "FPO":"BS-GrandBahama", "POS":"TT-Trinidad", "TAB":"TT-Tobago", "SXM":"SX-StMartin",
 "GPS":"EC-Galapagos", "IPC":"CL-EasterIsland", "ADZ":"CO-SanAndres", "SID":"CV-Sal", "RAI":"CV-Santiago", "ZNZ":"TZ-Zanzibar",
 "BKI":"MY-Borneo", "KCH":"MY-Borneo", "MYY":"MY-Borneo", "BWN":"MY-Borneo", "BPN":"ID-Kalimantan", "CJU":"KR-Jeju", "SYX":"CN-Hainan", "HAK":"CN-Hainan",
 "LGK":"MY-Langkawi", "PEN":"MY-Penang", "USM":"TH-Samui", "HKT":"TH-Phuket", "PQC":"VN-PhuQuoc", "MZG":"TW-Penghu",
 "CTS":"JP-Hokkaido", "HKD":"JP-Hokkaido", "AKJ":"JP-Hokkaido", "OKA":"JP-Okinawa", "ISG":"JP-Ishigaki", "MMY":"JP-Miyako",
 "HBA":"AU-Tasmania", "LST":"AU-Tasmania", "AKL":"NZ-North", "WLG":"NZ-North", "ROT":"NZ-North", "NPE":"NZ-North", "PMR":"NZ-North",
 "CHC":"NZ-South", "ZQN":"NZ-South", "DUD":"NZ-South", "NSN":"NZ-South", "IVC":"NZ-South",
 "NAN":"FJ-VitiLevu", "SUV":"FJ-VitiLevu", "POM":"PG-NewGuinea", "LAE":"PG-NewGuinea", "RAB":"PG-NewBritain", "HIR":"SB-Guadalcanal", "VLI":"VU-Efate",
 "PPT":"PF-Tahiti", "BOB":"PF-BoraBora", "RAR":"CK-Rarotonga", "APW":"WS-Upolu", "TBU":"TO-Tongatapu", "SPN":"MP-Saipan", "ROR":"PW-Babeldaob",
 "MAJ":"MH-Majuro", "TRW":"KI-Tarawa", "PPG":"AS-Tutuila",
 # Indonesia (island by airport)
 "CGK":"ID-Java", "SUB":"ID-Java", "JOG":"ID-Java", "BDO":"ID-Java", "SRG":"ID-Java", "HLP":"ID-Java", "DPS":"ID-Bali", "LOP":"ID-Lombok",
 "UPG":"ID-Sulawesi", "MDC":"ID-Sulawesi", "KNO":"ID-Sumatra", "PLM":"ID-Sumatra", "PKU":"ID-Sumatra", "PDG":"ID-Sumatra", "BTH":"ID-Batam",
 "BIK":"ID-Biak", "AMQ":"ID-Ambon", "DJJ":"ID-Papua",
 # Philippines (island by airport)
 "MNL":"PH-Luzon", "CRK":"PH-Luzon", "LAO":"PH-Luzon", "CEB":"PH-Cebu", "DVO":"PH-Mindanao", "CGY":"PH-Mindanao", "ZAM":"PH-Mindanao", "GES":"PH-Mindanao",
 "ILO":"PH-Panay", "KLO":"PH-Panay", "MPH":"PH-Panay", "BCD":"PH-Negros", "PPS":"PH-Palawan", "TAC":"PH-Leyte",
})
for _a in "HND NRT KIX ITM NGO FUK KOJ KMQ HIJ SDJ KMJ NGS OIT MYJ UKB KIJ TAK KCZ KMI AOJ".split(): ISLAND[_a] = "JP-Honshu"
SINGLE = {"IE","IS","CY","MT","JE","GG","IM"}  # whole country is one landmass named by its code
def landmass_of(iata, country, region):
    if country == "US": return {"AK":"US-AK","HI":"US-HI"}.get(region, "US-CONUS")
    if iata in ISLAND: return ISLAND[iata]
    if country in COUNTRY_LAND: return COUNTRY_LAND[country]
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
 "SBZ":"Sibiu Intl",
 # Globe expansion: long or ceremonial OurAirports names shortened to the commonly used airport name
 "GRU":"Sao Paulo Guarulhos Intl", "CGH":"Sao Paulo Congonhas", "GIG":"Rio de Janeiro Galeao Intl", "NAT":"Natal Intl", "SAL":"San Salvador Intl",
 "REC":"Recife Guararapes Intl", "BEL":"Belem Val de Cans Intl", "KMQ":"Komatsu", "IST":"Istanbul Ataturk", "AUH":"Abu Dhabi Intl",
 "ISB":"Islamabad Benazir Bhutto Intl", "TSN":"Tianjin Binhai Intl", "RMQ":"Taichung Intl", "BGW":"Baghdad Intl", "IXZ":"Port Blair Veer Savarkar",
 "PKU":"Pekanbaru Sultan Syarif Kasim II Intl", "PPS":"Puerto Princesa Intl", "CRK":"Clark Intl", "CXR":"Cam Ranh Intl", "DRW":"Darwin Intl",
 "TSV":"Townsville", "YUL":"Montreal Trudeau Intl", "YWG":"Winnipeg Richardson Intl", "YHZ":"Halifax Stanfield Intl", "YXS":"Prince George", "YXY":"Whitehorse Erik Nielsen Intl",
 "BOM":"Mumbai Chhatrapati Shivaji Maharaj Intl", "CCU":"Kolkata Netaji Subhash Chandra Bose Intl", "FUK":"Fukuoka", "ICN":"Seoul Incheon Intl",
 "GMP":"Seoul Gimpo Intl", "NRT":"Tokyo Narita Intl", "PVG":"Shanghai Pudong Intl", "SHA":"Shanghai Hongqiao Intl"}

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
for fn in ("world_airports_us.tsv", "world_airports_eu.tsv", "world_airports_amer.tsv", "world_airports_afme.tsv", "world_airports_asoc.tsv"):
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
