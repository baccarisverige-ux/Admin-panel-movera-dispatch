# Runs inside tools/gen_openapi.py in name order with its globals (rule 25 split). v0.18.172 (owner 2026-11-27/28, driver
# preferred areas): Area, Driver.preferredAreaIds / preferredAreas, DriverReservation.inPreferredArea, the driver's area
# search, the area at a point, PUT /driver/preferred-areas, the admin area list and switch, and the zone setting
# DriverAppConfig.reservations.preferredAreasMax (contract.json#preferredAreas).
_PA = C["preferredAreas"]
_V172 = "v0.18.172 (contract.json#preferredAreas): "
assert "Area" not in S, "Area exists before v0.18.172"
S["Area"] = obj(OrderedDict([
    ("areaId", s("Server id, e.g. SE-K-0181, SE-SDO-SODERMALM, FR-C-91326, FR-A-75104, FR-CITY-PARIS, FR-D-91.", pattern="^[A-Z0-9-]{3,40}$")),
    ("name", s("The area's name (the admin's name override when set).", minLength=1, maxLength=120)),
    ("kind", s(enum=_PA["kinds"])),
    ("kindLabel", s("The kind in the caller's language.", maxLength=40)),
    ("zoneId", ref("Id")),
    ("country", s(pattern="^[A-Z]{2}$")),
    ("parentName", s("The area it lies in, e.g. Stockholm for Södermalm, Essonne for a commune of 91.", maxLength=120)),
]), ["areaId", "name", "kind", "kindLabel", "zoneId", "country"], _V172 + _PA["area"], addl=False)
S["AreaList"] = obj({"items": arr(ref("Area"))}, ["items"], _V172 + _PA["search"], addl=False)
S["AreaAt"] = obj(OrderedDict([
    ("area", {"oneOf": [ref("Area"), {"type": "null"}]}),
    ("containing", arr(ref("Area"))),
]), ["area", "containing"], _V172 + _PA["at"], addl=False)
S["PreferredAreasCommand"] = obj({"areaIds": arr(s(pattern="^[A-Z0-9-]{3,40}$"), maxItems=30)}, ["areaIds"], _V172 + _PA["put"], addl=False)
_D = S["Driver"]["properties"]
assert "preferredAreaIds" not in _D, "Driver.preferredAreaIds exists before v0.18.172"
_D["preferredAreaIds"] = arr(s(), description=_V172 + _PA["driverView"])
_D["preferredAreas"] = arr(ref("Area"), description=_V172 + _PA["driverView"])
_DR = S["DriverReservation"]["properties"]
assert "inPreferredArea" not in _DR, "DriverReservation.inPreferredArea exists before v0.18.172"
_DR["inPreferredArea"] = b(_V172 + _PA["order"])
_RS = S["DriverReservations"]["properties"]
assert "preferredAreasMax" not in _RS
_RS["preferredAreasMax"] = dflt(i(_V172 + _PA["maxPerDriver"], minimum=1, maximum=30), C["configDefaults"]["reservations"]["preferredAreasMax"])
_L = PATHS["/driver/reservations"]["get"]
_L["description"] = (_L.get("description", "") + " " + _V172 + _PA["order"]).strip()
for _p in ("/driver/areas/search", "/driver/areas/at", "/driver/preferred-areas", "/admin/areas", "/admin/areas/{areaId}"):
    assert _p not in PATHS, _p + " exists before v0.18.172"
op("get", "/driver/areas/search", "searchDriverAreas", "Search the areas of the driver's zones (areas only, never addresses)", ["driver"], "Driver · Account",
   params=[{"name": "q", "in": "query", "required": False, "schema": s(maxLength=80)},
           {"name": "limit", "in": "query", "required": False, "schema": i(minimum=1, maximum=_PA["searchLimit"])}],
   ok=(200, "AreaList"), desc=_V172 + _PA["search"])
S["AreaAtCommand"] = obj(OrderedDict([("lat", n(minimum=-90, maximum=90)), ("lng", n(minimum=-180, maximum=180))]), ["lat", "lng"],
    _V172 + "The point in the body, never in the URL (GM 2026-11-28); never stored, never logged.", addl=False)
op("post", "/driver/areas/at", "driverAreaAt", "The smallest area of the driver's zones that holds a point", ["driver"], "Driver · Account",
   body="AreaAtCommand", ok=(200, "AreaAt"), read_only=True, desc=_V172 + _PA["at"] + " " + _PA["addressInput"])
op("put", "/driver/preferred-areas", "setDriverPreferredAreas", "Save the driver's preferred areas", ["driver"], "Driver · Account",
   body="PreferredAreasCommand", ok=(200, "Driver"), mutation=True, desc=_V172 + _PA["put"] + " " + _PA["visibility"])
S["AdminArea"] = obj(OrderedDict([
    ("areaId", s()), ("name", s()), ("officialName", s()), ("nameOverride", {"oneOf": [s(maxLength=120), {"type": "null"}]}),
    ("kind", s(enum=_PA["kinds"])), ("zoneId", ref("Id")), ("country", s()), ("parentName", s()),
    ("derived", b("true = outline built by Movera (Stockholm districts), approximate. " + _PA["outlineNote"]["en"])),
    ("source", s()), ("licence", s()), ("sourceYear", i()), ("active", b()), ("updatedAt", ref("Timestamp")),
]), ["areaId", "name", "officialName", "kind", "zoneId", "country", "derived", "source", "licence", "sourceYear", "active"], _V172 + _PA["admin"], addl=False)
S["AdminAreaPage"] = obj({"items": arr(ref("AdminArea")), "nextCursor": {"oneOf": [s(), {"type": "null"}]}}, ["items", "nextCursor"], _V172 + _PA["admin"])
S["AdminAreaCommand"] = obj({"active": b(), "nameOverride": {"oneOf": [s(minLength=1, maxLength=120), {"type": "null"}]}}, (), _V172 + "null clears the name override.", addl=False)
op("get", "/admin/areas", "adminListAreas", "The areas of a zone (preferred areas)", ["admin"], "Admin · Zones",
   params=[{"name": "zoneId", "in": "query", "required": False, "schema": ref("Id")},
           {"name": "q", "in": "query", "required": False, "schema": s(maxLength=80)}, pref("Cursor")],
   ok=(200, "AdminAreaPage"), permission="zones.read", desc=_V172 + _PA["admin"])
op("patch", "/admin/areas/{areaId}", "adminUpdateArea", "Switch an area on or off, or rename it", ["admin"], "Admin · Zones",
   params=[{"name": "areaId", "in": "path", "required": True, "schema": s(pattern="^[A-Z0-9-]{3,40}$")}],
   body="AdminAreaCommand", ok=(200, "AdminArea"), mutation=True, permission="zones.edit", desc=_V172 + _PA["admin"])
