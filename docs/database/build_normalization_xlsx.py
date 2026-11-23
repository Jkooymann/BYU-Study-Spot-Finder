import sys
from datetime import date, time
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
from openpyxl.utils import get_column_letter

OUT = sys.argv[1]
F = Font(name="Calibri", size=11)
B = Font(name="Calibri", size=11, bold=True)
I = Font(name="Calibri", size=11, italic=True)
DATE_FMT = "mm-dd-yy"
TIME_FMT = "h:mm AM/PM"

# ----------------------------------------------------------------------------
# Sample data (buildings, students, amenities and their ids are the real rows
# from supabase/seed.sql + migrations; the 5 study spots are sample rows)
# ----------------------------------------------------------------------------
BUILD = {
    "HBLL": (1, "Harold B. Lee Library", time(7), time(0)),
    "WSC": (2, "Wilkinson Student Center", time(7), time(23)),
    "JFSB": (3, "Joseph F. Smith Building", time(7), time(22)),
    "TNRB": (4, "Tanner Building", time(7), time(22)),
}
USERS = {
    "cosmo1": (1, "Cosmo C.", "cosmo1@byu.edu"),
    "jsmith": (2, "Jenna S.", "jsmith@byu.edu"),
    "tnguy7": (3, "Tran N.", "tnguy7@byu.edu"),
    "mlarse": (4, "Mia L.", "mlarse@byu.edu"),
}
AMEN = {
    "Power outlets": (1, "plug"), "WiFi": (2, "wifi"), "Tables": (3, "table"),
    "Comfy seating": (4, "armchair"), "Food allowed": (5, "utensils"),
    "Whiteboard": (6, "chalkboard"), "Natural light": (7, "sun"),
    "Quiet zone": (8, "volume-off"), "Talking allowed": (9, "message"),
}
BUSY = {
    "Low": (1, "Usually empty", "Easy to find a seat"),
    "Moderate": (2, "Moderate", "Some seats open"),
    "High": (3, "Usually busy", "Hard to find a seat"),
}
NOISE = [("Silent", 1, "No talking at all"), ("Quiet", 2, "Whispering only"),
         ("Moderate", 3, "Normal conversation is fine"), ("Loud", 4, "Lively; expect noise")]
GROUP = {1: "Solo", 4: "Small group", 8: "Big group"}

SPOTS = [
    dict(id=1, name="HBLL 5th Floor Quiet Carrels", b="HBLL", floor=5, indoor=True, fp=(42.5, 61.0), cm=None,
         max=1, noise="Quiet", busy="Moderate", desc="Individual carrels along the north windows",
         by="cosmo1", shared=True, added=date(2026, 11, 12),
         amen=["Power outlets", "Quiet zone", "Natural light"],
         favs=[("jsmith", date(2026, 11, 14)), ("tnguy7", date(2026, 11, 15))],
         rates=[("jsmith", 5, "Silent and lots of outlets", date(2026, 11, 16))]),
    dict(id=2, name="WSC Garden Court Tables", b="WSC", floor=1, indoor=True, fp=(55.0, 38.0), cm=None,
         max=8, noise="Moderate", busy="High", desc="Big tables near the food court",
         by="jsmith", shared=False, added=date(2026, 11, 13),
         amen=["Tables", "Food allowed", "Talking allowed", "WiFi"],
         favs=[("mlarse", date(2026, 11, 17))],
         rates=[("tnguy7", 4, "Busy at lunch but great tables", date(2026, 11, 18))]),
    dict(id=3, name="JFSB Basement Group Room", b="JFSB", floor=0, indoor=True, fp=(20.0, 75.5), cm=None,
         max=4, noise="Moderate", busy="Low", desc="Room with a whiteboard for group projects",
         by="tnguy7", shared=False, added=date(2026, 11, 14),
         amen=["Whiteboard", "Tables", "Talking allowed"],
         favs=[("cosmo1", date(2026, 11, 18))], rates=[]),
    dict(id=4, name="Tanner Atrium Couches", b="TNRB", floor=1, indoor=True, fp=(50.0, 50.0), cm=None,
         max=4, noise=None, busy="High", desc="Comfy chairs in the main atrium",
         by="cosmo1", shared=True, added=date(2026, 11, 15),
         amen=["Comfy seating", "Power outlets", "WiFi"], favs=[],
         rates=[("mlarse", 4, "Comfy, but hard to get a seat", date(2026, 11, 19))]),
    dict(id=5, name="Brigham Square Benches", b=None, floor=None, indoor=False, fp=None, cm=(48.2, 52.7),
         max=4, noise="Moderate", busy="Moderate", desc="Benches by the fountain, nice on sunny days",
         by="mlarse", shared=True, added=date(2026, 11, 16),
         amen=["WiFi", "Talking allowed"],
         favs=[("jsmith", date(2026, 11, 19)), ("cosmo1", date(2026, 11, 20))], rates=[]),
]


def tstr(t):
    return t.strftime("%I:%M %p").lstrip("0")


def yn(v):
    return "Yes" if v else "No"


# ----------------------------------------------------------------------------
# Writing helpers
# ----------------------------------------------------------------------------
class Sheet:
    def __init__(self, wb, title):
        self.ws = wb.create_sheet(title)
        self.widths = {}

    def put(self, r, c, v, font=F, fmt=None, wrap=False):
        cell = self.ws.cell(row=r, column=c, value=v)
        cell.font = font
        if isinstance(v, date):
            cell.number_format = DATE_FMT
        elif isinstance(v, time):
            cell.number_format = TIME_FMT
        if fmt:
            cell.number_format = fmt
        if wrap:
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        if not wrap and v is not None:
            n = 9 if isinstance(v, (date, time)) else len(str(v))
            self.widths[c] = max(self.widths.get(c, 0), n)
        return cell

    def table(self, r, c, headers, rows, name=None):
        """Writes an optional bold table name, bold headers, then rows. Returns next free row."""
        if name:
            self.put(r, c, name, B)
            r += 1
        for j, h in enumerate(headers):
            self.put(r, c + j, h, B)
        for i, row in enumerate(rows, 1):
            for j, v in enumerate(row):
                self.put(r + i, c + j, v)
        return r + len(rows) + 1

    def lines(self, r, c, title, items, font=F):
        self.put(r, c, title, B)
        for i, t in enumerate(items, 1):
            self.ws.cell(row=r + i, column=c, value=t).font = font
        return r + len(items) + 1

    def finish(self, fixed=None):
        for c, n in self.widths.items():
            self.ws.column_dimensions[get_column_letter(c)].width = min(max(n + 2, 6), 48)
        for c, w in (fixed or {}).items():
            self.ws.column_dimensions[c].width = w


wb = Workbook()
wb.remove(wb.active)

# ----------------------------------------------------------------------------
# 1. Unnormalized Data
# ----------------------------------------------------------------------------
s = Sheet(wb, "Unnormalized Data")
H0 = ["Spot Name", "Building", "Weekday Hours", "Floor", "Setting", "Map Position", "Group Size",
      "Noise Level", "Busyness", "Description", "Amenities", "Added By", "Shared", "Date Added",
      "Favorited By 1", "Favorited By 2", "Reviews"]
rows = []
for p in SPOTS:
    b = BUILD.get(p["b"])
    u = USERS[p["by"]]
    pos = (f"Floor plan: {p['fp'][0]}%, {p['fp'][1]}%" if p["fp"] else f"Campus map: {p['cm'][0]}%, {p['cm'][1]}%")
    bl = BUSY[p["busy"]]
    favs = [f"{USERS[n][1]} ({n}), {d.month}/{d.day}/{d.year % 100}" for n, d in p["favs"]] + [None, None]
    rev = "; ".join(f"{USERS[n][1]} ({n}): {st} stars, \"{cm}\", {d.month}/{d.day}/{d.year % 100}" for n, st, cm, d in p["rates"]) or None
    rows.append([
        p["name"], f"{p['b']} - {b[1]}" if b else "Outdoors (no building)",
        f"{tstr(b[2])} - {tstr(b[3])}" if b else None,
        ("B" if p["floor"] == 0 else str(p["floor"])) if p["floor"] is not None else None,
        "Indoors" if p["indoor"] else "Outdoors", pos, f"{GROUP[p['max']]} ({p['max']})",
        p["noise"], f"{p['busy']} ({bl[1]} - {bl[2]})", p["desc"], ", ".join(p["amen"]),
        f"{u[1]} ({p['by']}, {u[2]})", yn(p["shared"]), p["added"], favs[0], favs[1], rev])
s.table(1, 1, H0, rows)
s.finish()

# ----------------------------------------------------------------------------
# 1NF rows: one value per cell, one row per amenity x favorite x review
# ----------------------------------------------------------------------------
H1 = ["SpotName", "BuildingCode", "BuildingName", "WeekdayOpen", "WeekdayClose", "FloorNumber", "IsIndoors",
      "FloorPlanX", "FloorPlanY", "CampusMapX", "CampusMapY", "MaxGroupSize", "NoiseLevel", "BusynessLevel",
      "BusynessLabel", "BusynessHint", "Description", "AddedByNetID", "AddedByName", "AddedByEmail", "IsShared",
      "DateAdded", "AmenityName", "AmenityIcon", "FavByNetID", "FavoritedAt", "RatedByNetID", "StarRating",
      "ReviewComment", "RatedAt"]
R1 = []
for p in SPOTS:
    b = BUILD.get(p["b"])
    u = USERS[p["by"]]
    bl = BUSY[p["busy"]]
    for a in p["amen"]:
        for f in (p["favs"] or [(None, None)]):
            for rt in (p["rates"] or [(None, None, None, None)]):
                R1.append([
                    p["name"], p["b"], b[1] if b else None, b[2] if b else None, b[3] if b else None,
                    p["floor"], yn(p["indoor"]),
                    p["fp"][0] if p["fp"] else None, p["fp"][1] if p["fp"] else None,
                    p["cm"][0] if p["cm"] else None, p["cm"][1] if p["cm"] else None,
                    p["max"], p["noise"], p["busy"], bl[1], bl[2], p["desc"], p["by"], u[1], u[2],
                    yn(p["shared"]), p["added"], a, AMEN[a][1], f[0], f[1], rt[0], rt[1], rt[2], rt[3]])

s = Sheet(wb, "1st Normal Form")
s.table(1, 1, H1, R1)
s.finish()

PK = ["SpotName", "AmenityName", "FavByNetID", "RatedByNetID"]
PK_NOTE = ("A row is identified by the spot plus one amenity, one student who favorited it, and one student who reviewed it. "
           "(Spot names are unique in this data; IDs are added in the last step. Floor B is stored as 0.)")

# ----------------------------------------------------------------------------
# Primary Key
# ----------------------------------------------------------------------------
s = Sheet(wb, "Primary Key")
r = s.table(1, 1, H1, R1)
r += 1
s.put(r, 1, "Primary Key", B)
for j, k in enumerate(PK):
    s.put(r + 1, 1 + j, k)
s.ws.cell(row=r + 2, column=1, value=PK_NOTE).font = I
s.finish()

# ----------------------------------------------------------------------------
# Dependencies
# ----------------------------------------------------------------------------
s = Sheet(wb, "Dependencies")
r = s.table(1, 1, H1, R1)
r += 1
s.put(r, 1, "Primary Key", B)
for j, k in enumerate(PK):
    s.put(r + 1, 1 + j, k)
r += 3
r = s.lines(r, 1, "Functional Dependencies", [
    "SpotName -> BuildingCode, FloorNumber, IsIndoors, FloorPlanX, FloorPlanY, CampusMapX, CampusMapY, MaxGroupSize, NoiseLevel, BusynessLevel, Description, AddedByNetID, IsShared, DateAdded   (partial: depends on only part of the key)",
    "AmenityName -> AmenityIcon   (partial)",
    "SpotName, AmenityName -> (no other columns; the pair itself is the fact \"this spot has this amenity\")",
    "SpotName, FavByNetID -> FavoritedAt",
    "SpotName, RatedByNetID -> StarRating, ReviewComment, RatedAt",
])
r += 1
r = s.lines(r, 1, "Transitive Dependencies", [
    "BuildingCode -> BuildingName, WeekdayOpen, WeekdayClose",
    "AddedByNetID -> AddedByName, AddedByEmail",
    "BusynessLevel -> BusynessLabel, BusynessHint",
])
r += 1
s.lines(r, 1, "Other Problems Found", [
    "Amenities, favorites and reviews are three independent lists about a spot. Putting them in one row multiplies them (spot 1 has 3 amenities x 2 favorites x 1 review = 6 rows), so each list gets its own table.",
    "NoiseLevel is derived from the amenity tags: the website saves Quiet when a spot is tagged Quiet zone (and not Talking allowed), and Moderate for the opposite. The same fact is stored twice. See Database Changes, item 5.",
    "WeekdayOpen / WeekdayClose put a day of the week in the column name. Saturday hours would need two more columns (a repeating group). See Database Changes, item 3.",
])
s.finish(fixed={"A": 14})

# ----------------------------------------------------------------------------
# 2NF / 3NF table contents (natural keys)
# ----------------------------------------------------------------------------
def spot_cols_2nf(p):
    b = BUILD.get(p["b"])
    u = USERS[p["by"]]
    bl = BUSY[p["busy"]]
    return [p["name"], p["b"], b[1] if b else None, b[2] if b else None, b[3] if b else None, p["floor"],
            yn(p["indoor"]), p["fp"][0] if p["fp"] else None, p["fp"][1] if p["fp"] else None,
            p["cm"][0] if p["cm"] else None, p["cm"][1] if p["cm"] else None, p["max"], p["noise"], p["busy"],
            bl[1], bl[2], p["desc"], p["by"], u[1], u[2], yn(p["shared"]), p["added"]]


H_SPOT2 = ["SpotName", "BuildingCode", "BuildingName", "WeekdayOpen", "WeekdayClose", "FloorNumber", "IsIndoors",
           "FloorPlanX", "FloorPlanY", "CampusMapX", "CampusMapY", "MaxGroupSize", "NoiseLevel", "BusynessLevel",
           "BusynessLabel", "BusynessHint", "Description", "AddedByNetID", "AddedByName", "AddedByEmail", "IsShared",
           "DateAdded"]
SPOT_AMEN = [[p["name"], a] for p in SPOTS for a in p["amen"]]
AMEN_ROWS = [[a, v[1]] for a, v in AMEN.items()]
FAV_ROWS = [[p["name"], n, d] for p in SPOTS for n, d in p["favs"]]
RATE_ROWS = [[p["name"], n, st, cm, d] for p in SPOTS for n, st, cm, d in p["rates"]]


def lower_tables(s, r):
    """STUDY_SPOT_AMENITY | AMENITY | FAVORITE_SPOT | SPOT_RATING side by side, starting at row r."""
    ends = [
        s.table(r, 1, ["SpotName", "AmenityName"], SPOT_AMEN, "STUDY_SPOT_AMENITY"),
        s.table(r, 4, ["AmenityName", "AmenityIcon"], AMEN_ROWS, "AMENITY"),
        s.table(r, 7, ["SpotName", "FavByNetID", "FavoritedAt"], FAV_ROWS, "FAVORITE_SPOT"),
        s.table(r, 11, ["SpotName", "RatedByNetID", "StarRating", "ReviewComment", "RatedAt"], RATE_ROWS, "SPOT_RATING"),
    ]
    return max(ends)


s = Sheet(wb, "2nd Normal Form")
r = s.table(1, 1, H_SPOT2, [spot_cols_2nf(p) for p in SPOTS], "STUDY_SPOT")
r = lower_tables(s, r + 1)
s.ws.cell(row=r + 1, column=1, value=(
    "2NF: every column now depends on the whole key of its table. Spot facts depend on SpotName alone, the amenity icon on "
    "AmenityName alone, and favorites and reviews on their own two-part keys. The transitive dependencies are still in STUDY_SPOT.")).font = I
s.finish()

# 3NF
H_SPOT3 = ["SpotName", "BuildingCode", "FloorNumber", "IsIndoors", "FloorPlanX", "FloorPlanY", "CampusMapX",
           "CampusMapY", "MaxGroupSize", "NoiseLevel", "BusynessLevel", "Description", "AddedByNetID", "IsShared",
           "DateAdded"]


def spot_cols_3nf(p):
    return [p["name"], p["b"], p["floor"], yn(p["indoor"]), p["fp"][0] if p["fp"] else None,
            p["fp"][1] if p["fp"] else None, p["cm"][0] if p["cm"] else None, p["cm"][1] if p["cm"] else None,
            p["max"], p["noise"], p["busy"], p["desc"], p["by"], yn(p["shared"]), p["added"]]


s = Sheet(wb, "3rd Normal Form")
r = s.table(1, 1, H_SPOT3, [spot_cols_3nf(p) for p in SPOTS], "STUDY_SPOT")
r = lower_tables(s, r + 1)
r += 1
e1 = s.table(r, 1, ["BuildingCode", "BuildingName", "WeekdayOpen", "WeekdayClose"],
             [[k, v[1], v[2], v[3]] for k, v in BUILD.items()], "BUILDING")
e2 = s.table(r, 6, ["NetID", "DisplayName", "Email"], [[k, v[1], v[2]] for k, v in USERS.items()], "STUDENT_USER")
e3 = s.table(r, 10, ["BusynessLevel", "BusynessLabel", "BusynessHint"], [[k, v[1], v[2]] for k, v in BUSY.items()], "BUSYNESS_LEVEL")
r = max(e1, e2, e3)
s.ws.cell(row=r + 1, column=1, value=(
    "3NF: no column depends on another non-key column. Building details move to BUILDING, the person who added a spot to "
    "STUDENT_USER, and the busyness label and hint to BUSYNESS_LEVEL.")).font = I
s.finish()

# ----------------------------------------------------------------------------
# 3rd Normal Form w IDs (final design; Supabase table and column names)
# ----------------------------------------------------------------------------
s = Sheet(wb, "3rd Normal Form w IDs")
spot_rows = []
for p in SPOTS:
    spot_rows.append([p["id"], BUILD[p["b"]][0] if p["b"] else None, USERS[p["by"]][0], p["name"], p["floor"],
                      yn(p["indoor"]), p["fp"][0] if p["fp"] else None, p["fp"][1] if p["fp"] else None,
                      p["cm"][0] if p["cm"] else None, p["cm"][1] if p["cm"] else None, p["max"], p["noise"],
                      p["busy"], p["desc"], yn(p["shared"]), p["added"]])
r = s.table(1, 1, ["study_spot_id", "building_id", "submitted_by_user_id", "spot_name", "floor_number", "is_indoors",
                   "floor_plan_x_percent", "floor_plan_y_percent", "campus_map_x_percent", "campus_map_y_percent",
                   "max_group_size", "noise_level", "typical_busyness_level", "description", "is_shared",
                   "created_at"], spot_rows, "STUDY_SPOT")
r += 1
id_of = {p["name"]: p["id"] for p in SPOTS}
e = [
    s.table(r, 1, ["study_spot_id", "amenity_id"], [[id_of[n], AMEN[a][0]] for n, a in SPOT_AMEN], "STUDY_SPOT_AMENITY"),
    s.table(r, 4, ["amenity_id", "amenity_name", "amenity_icon_name"],
            [[v[0], a, v[1]] for a, v in AMEN.items()], "AMENITY"),
    s.table(r, 8, ["user_id", "study_spot_id", "favorited_at"],
            [[USERS[n][0], id_of[sp], d] for sp, n, d in FAV_ROWS], "FAVORITE_SPOT"),
    s.table(r, 12, ["spot_rating_id", "user_id", "study_spot_id", "star_rating", "review_comment", "rated_at"],
            [[i, USERS[n][0], id_of[sp], st, cm, d] for i, (sp, n, st, cm, d) in enumerate(RATE_ROWS, 1)], "SPOT_RATING"),
]
r = max(e) + 1
hours = [[v[0], d, v[2], v[3]] for k, v in BUILD.items() for d in range(1, 6)]
e = [
    s.table(r, 1, ["building_id", "building_code", "building_name"],
            [[v[0], k, v[1]] for k, v in BUILD.items()], "BUILDING"),
    s.table(r, 5, ["building_id", "day_of_week", "open_time", "close_time"], hours, "BUILDING_HOURS (new)"),
    s.table(r, 10, ["user_id", "byu_net_id", "display_name", "byu_email"],
            [[v[0], k, v[1], v[2]] for k, v in USERS.items()], "STUDENT_USER"),
    s.table(r, 15, ["busyness_level", "sort_order", "display_label", "display_hint"],
            [[k, v[0], v[1], v[2]] for k, v in BUSY.items()], "BUSYNESS_LEVEL (new)"),
]
e.append(s.table(r + 6, 15, ["noise_level", "sort_order", "description"], [list(n) for n in NOISE], "NOISE_LEVEL (new)"))
r = max(e) + 1
s.lines(r, 1, "Notes", [
    "Column and table names here are the real Supabase names. New tables are marked (new); see the Database Changes sheet.",
    "BUILDING_HOURS replaces building.weekday_open_time / weekday_close_time: one row per building per day (0 = Sunday ... 6 = Saturday). The weekday hours were copied to days 1-5.",
    "BUSYNESS_LEVEL and NOISE_LEVEL use the level word itself (Low, Quiet, ...) as the key, so study_spot keeps storing the same values and the website did not need to change.",
    "NOISE_LEVEL is a lookup (domain) table: the list Silent / Quiet / Moderate / Loud used to be typed out in two CHECK rules (study_spot and saved_filter); now both point to one table.",
    "Columns not shown in the walkthrough are unchanged: building.floor_count, campus_map_latitude, campus_map_longitude; student_user.auth_user_id, account_created_at; study_spot.is_sample_spot.",
    "Study spot rows are sample rows. Buildings, students, amenities and their ids are the real rows from the database's seed data.",
], font=I)
s.finish(fixed={"A": 14})

# ----------------------------------------------------------------------------
# Supporting Tables (the tables that are not part of the study spot listing)
# ----------------------------------------------------------------------------
s = Sheet(wb, "Supporting Tables")
rev = [
    ["saved_filter", "saved_filter_id", "saved_filter_id -> user_id, filter_name, group_size, preferred_noise_level, indoor_outdoor_preference, max_busyness_level, created_at",
     "Yes", "Yes", "Yes", "preferred_noise_level and max_busyness_level now point to NOISE_LEVEL and BUSYNESS_LEVEL instead of repeating the allowed values (changes 1 and 2)."],
    ["user_session", "session_id", "session_id -> user_id, started_at, last_seen_at, active_seconds",
     "Yes", "Yes", "Yes", "No change. active_seconds is measured, not calculated from the other columns."],
    ["spot_search", "search_id", "search_id -> user_id, started_at, found_at", "Yes", "Yes", "Yes", "No change."],
    ["app_admin", "auth_user_id", "auth_user_id -> note, added_at", "Yes", "Yes", "Yes", "No change."],
    ["ai_recommendation", "ai_recommendation_id",
     "ai_recommendation_id -> user_id, cache_key, status, recommendations, model_name, error_message, created_at",
     "No", "Yes", "Yes",
     "recommendations holds a list of spots and reasons in one cell (JSON). That breaks 1NF. Recommended fix below (change 6); not applied, because the AI Edge Function would also have to change."],
    ["okr1_session_lengths, okr2_searches, okr_student_accounts", "(views)", "Calculated from the tables above when read; they store no data.",
     "n/a", "n/a", "n/a", "No change."],
]
r = s.table(1, 1, ["Table", "Primary Key", "Functional Dependencies", "1NF", "2NF", "3NF", "Finding / Action"], rev)
for row in s.ws.iter_rows(min_row=2, max_row=r - 1):
    for c in row:
        c.alignment = Alignment(wrap_text=True, vertical="top")
r += 1
r = s.table(r, 1, ["ai_recommendation_id", "user_id", "status", "recommendations"],
            [[41, 2, "ok", '[{"spot_id": 1, "reason": "Quiet with outlets, like your favorites"}, {"spot_id": 4, "reason": "Comfy seating"}]']],
            "AI_RECOMMENDATION (today: list in one cell)")
r += 1
s.table(r, 1, ["ai_recommendation_id", "rank", "study_spot_id", "reason"],
        [[41, 1, 1, "Quiet with outlets, like your favorites"], [41, 2, 4, "Comfy seating"]],
        "AI_RECOMMENDATION_SPOT (recommended: one row per recommended spot)")
s.finish(fixed={"A": 22, "B": 20, "C": 60, "D": 8, "E": 8, "F": 8, "G": 70})

# ----------------------------------------------------------------------------
# Database Changes
# ----------------------------------------------------------------------------
s = Sheet(wb, "Database Changes")
MIG = "supabase/migrations/20261123010000_normalize_to_3nf.sql"
chg = [
    [1, "Added lookup table NOISE_LEVEL (Silent, Quiet, Moderate, Loud). study_spot.noise_level and saved_filter.preferred_noise_level now have foreign keys to it; their two CHECK rules were removed.",
     "noise_level (new), study_spot, saved_filter",
     "The same list of allowed values was typed out in two tables. Changing it meant editing both (update anomaly), and the levels had nowhere to keep a description.",
     "Applied", MIG],
    [2, "Added lookup table BUSYNESS_LEVEL with each level's label and hint (High = Usually busy / Hard to find a seat). study_spot.typical_busyness_level and saved_filter.max_busyness_level now have foreign keys to it; their CHECK rules were removed.",
     "busyness_level (new), study_spot, saved_filter",
     "Transitive dependency BusynessLevel -> BusynessLabel, BusynessHint. The label and hint only lived in the website's JavaScript.",
     "Applied", MIG],
    [3, "Added table BUILDING_HOURS (building_id, day_of_week, open_time, close_time). Copied each building's weekday hours to Monday-Friday, then removed building.weekday_open_time and weekday_close_time.",
     "building_hours (new), building",
     "Repeating group: the day was part of the column name, so Saturday or Friday hours would need new columns. Nothing on the website read these columns.",
     "Applied", MIG],
    [4, "Sample data file now puts the sample hours into building_hours.", "seed.sql",
     "Keeps the sample data in step with change 3.", "Applied", "supabase/seed.sql"],
    [5, "Store noise level once. Today the website saves the Quiet zone / Talking allowed amenity tags AND a noise_level computed from them.",
     "study_spot, study_spot_amenity, amenity",
     "Derived (redundant) data: the two can disagree if only one is edited. Fix: keep the tags and drop noise_level, or drop the two tags and use noise_level.",
     "Recommended", "Needs website and AI function changes"],
    [6, "Move ai_recommendation.recommendations (a JSON list) into a child table AI_RECOMMENDATION_SPOT (ai_recommendation_id, rank, study_spot_id, reason).",
     "ai_recommendation",
     "1NF: many values in one cell, and the spot ids inside it are not checked against study_spot.",
     "Recommended", "Needs the AI Edge Function changed and redeployed"],
    [7, "One rating per student per spot: add a unique rule on spot_rating (user_id, study_spot_id).", "spot_rating",
     "Normalization showed SpotName + RatedByNetID is the real key, but the database lets the same student rate a spot many times.",
     "Recommended", "No ratings page exists yet; add with that feature"],
    [8, "Remove study_spot.is_sample_spot.", "study_spot",
     "Every row has been false since the example spots were deleted on 2026-11-11, so the column holds no information.",
     "Recommended", "Needs website and security rule changes first"],
    [9, "Read the building list from the database instead of the copy in prototype/js/data.js.", "building",
     "The building names and floors are stored in two places (database and website code), which can drift apart.",
     "Recommended", "Website change"],
]
r = s.table(1, 1, ["#", "Change", "Tables", "Problem it fixes", "Status", "Where"], chg)
for row in s.ws.iter_rows(min_row=2, max_row=r - 1):
    for c in row:
        c.alignment = Alignment(wrap_text=True, vertical="top")
r += 1
s.lines(r, 1, "How the applied changes reach the live database", [
    "Applied = written as SQL in the GitHub repo. The live Supabase database changes when the SQL file is pasted into Supabase -> SQL Editor and run.",
    "The website did not need any code changes for items 1-4: it keeps saving the same values.",
    "Full write-up: docs/database/normalization-3nf.md in the GitHub repo.",
], font=I)
s.finish(fixed={"A": 5, "B": 60, "C": 26, "D": 60, "E": 13, "F": 36})

wb.save(OUT)
print("saved", OUT)
