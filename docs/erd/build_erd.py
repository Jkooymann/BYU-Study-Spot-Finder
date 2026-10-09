"""Builds erd.svg for the BYU Study Spot Finder. Run: python3 build_erd.py"""
from html import escape

W, HDR, ROW, BAND = 390, 46, 24, 34
COL = [40, 590, 1160, 1730]

ENT = {}  # name -> dict(x, y, h)

def entity(key, title, x, y, attrs, join=None):
    h = HDR + ROW * len(attrs) + (BAND if join else 0)
    ENT[key] = dict(x=x, y=y, h=h)
    out = [f'<g><rect x="{x}" y="{y}" width="{W}" height="{h}" rx="8" class="box"/>',
           f'<path d="M{x} {y+8} a8 8 0 0 1 8 -8 h{W-16} a8 8 0 0 1 8 8 v{HDR-8} h-{W} z" class="{"hdrj" if join else "hdr"}"/>',
           f'<text x="{x+W/2}" y="{y+30}" class="title">{escape(title)}</text>']
    yy = y + HDR
    if join:
        out.append(f'<rect x="{x}" y="{yy}" width="{W}" height="{BAND}" class="band"/>')
        out.append(f'<text x="{x+W/2}" y="{yy+22}" class="bandt">{escape(join)}</text>')
        yy += BAND
    for i, (k, name, typ, note) in enumerate(attrs):
        cy = yy + i * ROW
        if i % 2: out.append(f'<rect x="{x+1}" y="{cy}" width="{W-2}" height="{ROW}" class="zebra"/>')
        if k: out.append(f'<text x="{x+10}" y="{cy+16}" class="key {"pk" if "PK" in k else "fk"}">{k}</text>')
        out.append(f'<text x="{x+58}" y="{cy+16}" class="attr{" pkname" if "PK" in k else ""}">{escape(name)}</text>')
        out.append(f'<text x="{x+W-10}" y="{cy+16}" class="type">{escape(typ)}</text>')
    out.append('</g>')
    return "\n".join(out)

def one(x, y, d):  # d = direction pointing away from the entity (+1 right/down, -1 left/up), axis inferred
    pass

def end_marker(px, py, axis, s, many):
    """Marker at the point where a line meets an entity. s=+1 if line leaves toward +axis."""
    out = []
    if axis == 'x':
        bx = px + s * 16
        out.append(f'<line x1="{bx}" y1="{py-9}" x2="{bx}" y2="{py+9}" class="mk"/>')
        if many:
            out += [f'<line x1="{px+s*14}" y1="{py}" x2="{px}" y2="{py-10}" class="mk"/>',
                    f'<line x1="{px+s*14}" y1="{py}" x2="{px}" y2="{py+10}" class="mk"/>']
        else:
            out.append(f'<line x1="{bx+s*6}" y1="{py-9}" x2="{bx+s*6}" y2="{py+9}" class="mk"/>')
    else:
        by = py + s * 16
        out.append(f'<line x1="{px-9}" y1="{by}" x2="{px+9}" y2="{by}" class="mk"/>')
        if many:
            out += [f'<line x1="{px}" y1="{py+s*14}" x2="{px-10}" y2="{py}" class="mk"/>',
                    f'<line x1="{px}" y1="{py+s*14}" x2="{px+10}" y2="{py}" class="mk"/>']
        else:
            out.append(f'<line x1="{px-9}" y1="{by+s*6}" x2="{px+9}" y2="{by+s*6}" class="mk"/>')
    return out

def rel(points, start_many, end_many, verb, card, lx, ly):
    pts = " ".join(f"{x},{y}" for x, y in points)
    out = [f'<polyline points="{pts}" class="ln"/>']
    for (p, q, many) in ((points[0], points[1], start_many), (points[-1], points[-2], end_many)):
        axis = 'x' if p[1] == q[1] else 'y'
        s = (1 if q[0] > p[0] else -1) if axis == 'x' else (1 if q[1] > p[1] else -1)
        out += end_marker(p[0], p[1], axis, s, many)
    w = max(len(verb), len(card)) * 7.6 + 16
    out.append(f'<rect x="{lx-w/2}" y="{ly-19}" width="{w}" height="38" rx="5" class="lblbg"/>')
    out.append(f'<text x="{lx}" y="{ly-3}" class="verb">{escape(verb)}</text>')
    out.append(f'<text x="{lx}" y="{ly+13}" class="card">{escape(card)}</text>')
    return "\n".join(out)

T = 120
parts = []
parts.append(entity("bld", "Building", COL[0], T, [
    ("PK", "building_id", "int", ""),
    ("", "building_code", "text · e.g. HBLL", ""),
    ("", "building_name", "text", ""),
    ("", "campus_map_latitude", "decimal", ""),
    ("", "campus_map_longitude", "decimal", ""),
    ("", "floor_count", "int", ""),
    ("", "weekday_open_time", "time", ""),
    ("", "weekday_close_time", "time", ""),
]))
parts.append(entity("spot", "Study Spot", COL[1], T, [
    ("PK", "study_spot_id", "int", ""),
    ("FK", "building_id", "int", ""),
    ("FK", "submitted_by_user_id", "int · null = sample", ""),
    ("", "spot_name", "text", ""),
    ("", "floor_number", "int", ""),
    ("", "location_description", "text", ""),
    ("", "is_indoors", "boolean", ""),
    ("", "seat_count", "int", ""),
    ("", "max_group_size", "int", ""),
    ("", "noise_level", "Silent/Quiet/Moderate/Loud", ""),
    ("", "typical_busyness_level", "Low/Moderate/High", ""),
    ("", "floor_plan_x_percent", "decimal", ""),
    ("", "floor_plan_y_percent", "decimal", ""),
    ("", "is_sample_spot", "boolean", ""),
    ("", "created_at", "timestamp", ""),
]))
parts.append(entity("user", "Student User", COL[1], 620, [
    ("PK", "user_id", "int", ""),
    ("", "byu_net_id", "text · unique", ""),
    ("", "display_name", "text", ""),
    ("", "byu_email", "text", ""),
    ("", "account_created_at", "timestamp", ""),
]))
parts.append(entity("rating", "Spot Rating", COL[0], 560, [
    ("PK", "spot_rating_id", "int", ""),
    ("FK", "user_id", "int", ""),
    ("FK", "study_spot_id", "int", ""),
    ("", "star_rating", "int · 1 to 5", ""),
    ("", "review_comment", "text · optional", ""),
    ("", "rated_at", "timestamp", ""),
]))
parts.append(entity("ssa", "Study Spot Amenity", COL[2], T, [
    ("PK,FK", "study_spot_id", "int", ""),
    ("PK,FK", "amenity_id", "int", ""),
], join="Join table · Study Spot ↔ Amenity"))
parts.append(entity("fav", "Favorite Spot", COL[2], 320, [
    ("PK,FK", "user_id", "int", ""),
    ("PK,FK", "study_spot_id", "int", ""),
    ("", "favorited_at", "timestamp", ""),
], join="Join table · Student User ↔ Study Spot"))
parts.append(entity("filter", "Saved Filter", COL[2], 620, [
    ("PK", "saved_filter_id", "int", ""),
    ("FK", "user_id", "int", ""),
    ("", "filter_name", "text", ""),
    ("", "group_size", "int", ""),
    ("", "preferred_noise_level", "same as noise_level", ""),
    ("", "indoor_outdoor_preference", "enum", ""),
    ("", "max_busyness_level", "Low/Moderate/High", ""),
    ("", "created_at", "timestamp", ""),
]))
parts.append(entity("amen", "Amenity", COL[3], T, [
    ("PK", "amenity_id", "int", ""),
    ("", "amenity_name", "text · e.g. Power outlets", ""),
    ("", "amenity_icon_name", "text", ""),
]))

E = ENT
R, L = lambda k: E[k]["x"] + W, lambda k: E[k]["x"]
mid = lambda a, b: (a + b) / 2
rels = [
    rel([(R("bld"), 220), (L("spot"), 220)], False, True, "contains", "one-to-many", mid(R("bld"), L("spot")), 220),
    rel([(L("spot") + 170, E["user"]["y"]), (L("spot") + 170, E["spot"]["y"] + E["spot"]["h"])], False, True,
        "submits", "one-to-many", L("spot") + 170, mid(E["user"]["y"], E["spot"]["y"] + E["spot"]["h"])),
    rel([(R("spot"), 200), (L("ssa"), 200)], False, True, "offers", "one-to-many", mid(R("spot"), L("ssa")), 200 - 34),
    rel([(L("amen"), 200), (R("ssa"), 200)], False, True, "is offered at", "one-to-many", mid(R("ssa"), L("amen")), 200 - 34),
    rel([(R("spot"), 400), (L("fav"), 400)], False, True, "is favorited in", "one-to-many", mid(R("spot"), L("fav")), 400 - 34),
    rel([(R("user"), 660), (R("user") + 70, 660), (R("user") + 70, 450), (L("fav"), 450)], False, True,
        "favorites", "one-to-many", R("user") + 70, 560),
    rel([(R("user"), 760), (L("filter"), 760)], False, True, "saves", "one-to-many", mid(R("user"), L("filter")), 760 - 34),
    rel([(L("user"), 720), (R("rating"), 720)], False, True, "writes", "one-to-many", mid(R("rating"), L("user")), 720 - 34),
    rel([(L("spot"), 470), (L("bld") + W / 2, 470), (L("bld") + W / 2, E["rating"]["y"])], False, True,
        "receives", "one-to-many", L("bld") + W / 2, 515),
]

# Relationship key panel
kx, ky = COL[3], 300
key_rows = [
    ("Building", "contains", "Study Spot", "one-to-many"),
    ("Student User", "submits", "Study Spot", "one-to-many"),
    ("Student User", "writes", "Spot Rating", "one-to-many"),
    ("Study Spot", "receives", "Spot Rating", "one-to-many"),
    ("Student User", "saves", "Saved Filter", "one-to-many"),
    ("Study Spot", "offers", "Amenity", "many-to-many*"),
    ("Student User", "favorites", "Study Spot", "many-to-many*"),
]
kh = 70 + len(key_rows) * 46 + 200
key = [f'<rect x="{kx}" y="{ky}" width="{W}" height="{kh}" rx="8" class="keybox"/>',
       f'<text x="{kx+16}" y="{ky+30}" class="keyh">Relationships</text>']
for i, (a, v, b, c) in enumerate(key_rows):
    y = ky + 62 + i * 46
    key.append(f'<text x="{kx+16}" y="{y}" class="kt"><tspan class="kb">{a}</tspan> {v} <tspan class="kb">{b}</tspan></text>')
    key.append(f'<text x="{kx+16}" y="{y+18}" class="{"kmm" if "many-to-many" in c else "k1m"}">{c}</text>')
y = ky + 62 + len(key_rows) * 46 + 4
key.append(f'<text x="{kx+16}" y="{y}" class="kn">* Stored through a join table (purple).</text>')
y += 34
key.append(f'<text x="{kx+16}" y="{y}" class="keyh2">How to read the line ends</text>')
y += 26
key += end_marker(kx + 16, y, 'x', 1, False) + [f'<line x1="{kx+16}" y1="{y}" x2="{kx+60}" y2="{y}" class="ln"/>',
       f'<text x="{kx+72}" y="{y+5}" class="kt">exactly one</text>']
y += 34
key += end_marker(kx + 16, y, 'x', 1, True) + [f'<line x1="{kx+16}" y1="{y}" x2="{kx+60}" y2="{y}" class="ln"/>',
       f'<text x="{kx+72}" y="{y+5}" class="kt">many (zero or more)</text>']
y += 34
key.append(f'<text x="{kx+16}" y="{y}" class="kt"><tspan class="key pk">PK</tspan>  primary key   <tspan class="key fk">FK</tspan>  foreign key</text>')
y += 26
key.append(f'<text x="{kx+16}" y="{y}" class="kn">Spots with no submitted_by_user_id are the</text>')
key.append(f'<text x="{kx+16}" y="{y+18}" class="kn">built-in sample spots. Busyness is a typical</text>')
key.append(f'<text x="{kx+16}" y="{y+36}" class="kn">level, not live data.</text>')

WIDTH, HEIGHT = COL[3] + W + 40, max(ky + kh, 860) + 40
css = """
text{font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif}
.bg{fill:#fbfaf7}
.h1{font-size:28px;font-weight:700;fill:#0b2a4a}
.sub{font-size:14px;fill:#55606e}
.box{fill:#fff;stroke:#0b2a4a;stroke-width:1.5}
.hdr{fill:#0b2a4a}.hdrj{fill:#5b3f8c}
.title{font-size:17px;font-weight:700;fill:#fff;text-anchor:middle}
.band{fill:#efe9f8}.bandt{font-size:12px;fill:#5b3f8c;text-anchor:middle;font-weight:600}
.zebra{fill:#f4f6f9}
.attr{font-size:13.5px;fill:#1c2430;font-family:'JetBrains Mono',Menlo,Consolas,monospace}
.pkname{font-weight:700;text-decoration:underline}
.type{font-size:11.5px;fill:#6b7684;text-anchor:end}
.key{font-size:10.5px;font-weight:700}.pk{fill:#b8860b}.fk{fill:#2a6fb0}
.ln{fill:none;stroke:#3a4656;stroke-width:1.8}
.mk{stroke:#3a4656;stroke-width:1.8}
.lblbg{fill:#fff;stroke:#c9d1db}
.verb{font-size:12.5px;font-weight:700;fill:#0b2a4a;text-anchor:middle}
.card{font-size:12px;fill:#2a6fb0;text-anchor:middle;font-weight:600}
.keybox{fill:#fff;stroke:#c9d1db}
.keyh{font-size:17px;font-weight:700;fill:#0b2a4a}.keyh2{font-size:14px;font-weight:700;fill:#0b2a4a}
.kt{font-size:13px;fill:#1c2430}.kb{font-weight:700}
.k1m{font-size:12.5px;fill:#2a6fb0;font-weight:600}.kmm{font-size:12.5px;fill:#5b3f8c;font-weight:700}
.kn{font-size:12px;fill:#55606e}
"""
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">
<style>{css}</style>
<rect width="100%" height="100%" class="bg"/>
<text x="40" y="52" class="h1">BYU Study Spot Finder · Starting ERD</text>
<text x="40" y="80" class="sub">8 entities, 7 relationships. Each line is labeled with what it means and its cardinality; crow's foot = the “many” side.</text>
{chr(10).join(rels)}
{chr(10).join(parts)}
{chr(10).join(key)}
</svg>"""
open("erd.svg", "w").write(svg)
print(WIDTH, HEIGHT)
