# Runs inside tools/gen_openapi.py in name order with its globals (rule 25 split). v0.18.178 (owner 2026-11-28, car
# make/model picker): CarCatalogue for the driver, the admin catalogue (add, rename, hide/show; no delete), optional
# makeId / modelId on VehicleRequest, Vehicle and AdminVehicleUpdate (contract.json#carCatalogue).
_CC = C["carCatalogue"]
_V178 = "v0.18.178 (contract.json#carCatalogue): "
_CID = s(pattern="^[a-z0-9][a-z0-9.-]{0,79}$")
for _n in ("CarCatalogue", "CarMake", "CarModel", "AdminCarCatalogue", "AdminCarMake", "AdminCarModel", "AdminCarNameCommand", "AdminCarUpdateCommand"):
    assert _n not in S, _n + " exists before v0.18.178"
S["CarModel"] = obj(OrderedDict([("modelId", _CID), ("name", s(minLength=1, maxLength=80))]), ["modelId", "name"], _V178 + _CC["ids"], addl=False)
S["CarMake"] = obj(OrderedDict([("makeId", _CID), ("name", s(minLength=1, maxLength=80)), ("models", arr(ref("CarModel")))]),
                   ["makeId", "name", "models"], _V178 + _CC["ids"], addl=False)
S["CarCatalogue"] = obj(OrderedDict([
    ("version", i("Grows on every admin change; also sent as ETag.", minimum=0)),
    ("attribution", s("Shown in the driver picker. " + _CC["attribution"]["en"])),
    ("makes", arr(ref("CarMake"))),
]), ["version", "attribution", "makes"], _V178 + _CC["driverRead"], addl=False)
_SRC = s(enum=["eea", "admin"])
S["AdminCarModel"] = obj(OrderedDict([("modelId", _CID), ("name", s()), ("hidden", b()), ("source", _SRC), ("updatedAt", ref("Timestamp"))]),
                         ["modelId", "name", "hidden", "source"], _V178 + _CC["admin"], addl=False)
S["AdminCarMake"] = obj(OrderedDict([("makeId", _CID), ("name", s()), ("hidden", b()), ("source", _SRC), ("updatedAt", ref("Timestamp")),
                                     ("models", arr(ref("AdminCarModel")))]), ["makeId", "name", "hidden", "source", "models"], _V178 + _CC["admin"], addl=False)
S["AdminCarCatalogue"] = obj(OrderedDict([("version", i(minimum=0)), ("attribution", s()), ("makes", arr(ref("AdminCarMake")))]),
                             ["version", "attribution", "makes"], _V178 + _CC["admin"], addl=False)
S["AdminCarNameCommand"] = obj({"name": s(minLength=1, maxLength=80)}, ["name"], _V178 + _CC["admin"], addl=False)
S["AdminCarUpdateCommand"] = obj(OrderedDict([("name", s(minLength=1, maxLength=80)), ("hidden", b())]), (), _V178 + _CC["admin"], addl=False)
_NID = {"oneOf": [_CID, {"type": "null"}]}
for _sch in ("VehicleRequest", "Vehicle", "AdminVehicleUpdate"):
    _P = S[_sch]["properties"]
    assert "makeId" not in _P and "modelId" not in _P, _sch + ".makeId exists before v0.18.178"
    _P["makeId"] = {**_NID, "description": _V178 + "null or missing = typed by hand (Annat). " + _CC["vehicleIds"]}
    _P["modelId"] = {**_NID, "description": _V178 + "null or missing = typed by hand (Annat)."}
S["VehicleRequest"]["properties"]["make"] = s(_V178 + "Always the stored string (1-80 characters, trimmed); the catalogue name when makeId is sent.", minLength=1, maxLength=80)
S["VehicleRequest"]["properties"]["model"] = s(_V178 + "Always the stored string (1-80 characters, trimmed).", minLength=1, maxLength=80)
_AV = PATHS["/admin/vehicles/{vehicleId}"]["patch"]
_AV["description"] = (_AV.get("description", "") + " " + _V178 + _CC["adminVehicle"]).strip()
for _p in ("/driver/car-catalogue", "/admin/car-catalogue", "/admin/car-catalogue/makes", "/admin/car-catalogue/makes/{makeId}",
           "/admin/car-catalogue/makes/{makeId}/models", "/admin/car-catalogue/models/{modelId}"):
    assert _p not in PATHS, _p + " exists before v0.18.178"
op("get", "/driver/car-catalogue", "getDriverCarCatalogue", "The car makes and models the driver can pick from", ["driver"], "Driver · Account",
   params=[{"name": "If-None-Match", "in": "header", "required": False, "schema": s()}], ok=(200, "CarCatalogue"), desc=_V178 + _CC["driverRead"] + " " + _CC["search"])
PATHS["/driver/car-catalogue"]["get"]["responses"]["304"] = {"description": "Not modified (If-None-Match equals the current version's ETag)."}
_MK = {"name": "makeId", "in": "path", "required": True, "schema": _CID}
_MD = {"name": "modelId", "in": "path", "required": True, "schema": _CID}
op("get", "/admin/car-catalogue", "adminGetCarCatalogue", "The car catalogue, hidden rows included", ["admin"], "Admin · People",
   ok=(200, "AdminCarCatalogue"), permission="drivers.read", desc=_V178 + _CC["admin"])
op("post", "/admin/car-catalogue/makes", "adminAddCarMake", "Add a make to the car catalogue", ["admin"], "Admin · People",
   body="AdminCarNameCommand", ok=(201, "AdminCarMake"), mutation=True, permission="vehicles.edit", desc=_V178 + _CC["admin"])
op("post", "/admin/car-catalogue/makes/{makeId}/models", "adminAddCarModel", "Add a model to a make", ["admin"], "Admin · People",
   params=[_MK], body="AdminCarNameCommand", ok=(201, "AdminCarModel"), mutation=True, permission="vehicles.edit", desc=_V178 + _CC["admin"])
op("patch", "/admin/car-catalogue/makes/{makeId}", "adminUpdateCarMake", "Rename, hide or show a make (no delete)", ["admin"], "Admin · People",
   params=[_MK], body="AdminCarUpdateCommand", ok=(200, "AdminCarMake"), mutation=True, permission="vehicles.edit", desc=_V178 + _CC["admin"])
op("patch", "/admin/car-catalogue/models/{modelId}", "adminUpdateCarModel", "Rename, hide or show a model (no delete)", ["admin"], "Admin · People",
   params=[_MD], body="AdminCarUpdateCommand", ok=(200, "AdminCarModel"), mutation=True, permission="vehicles.edit", desc=_V178 + _CC["admin"])
