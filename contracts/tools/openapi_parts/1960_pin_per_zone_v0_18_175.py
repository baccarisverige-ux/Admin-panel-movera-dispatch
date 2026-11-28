# Runs inside tools/gen_openapi.py in name order with its globals (rule 25 split). v0.18.175 (owner 2026-11-28 "PIN per
# zone - Fix now", the rider's own PIN choice): RiderAppConfig.features.pin from the zone's pickupPin.required,
# Rider.safety / RiderProfileUpdate.safety { pinAlways }, TripProjection.pinSource (contract.json#pinPerZone).
_PZ = C["pinPerZone"]
_V175 = "v0.18.175 (contract.json#pinPerZone): "
_F175 = S["RiderAppConfig"]["properties"]["features"]["properties"]
_F175["pin"] = b(_V175 + _PZ["riderConfigFeature"])
S["RiderSafety"] = obj({"pinAlways": b(_V175 + "the rider asks for a PIN on all his own rides (default false).")}, ["pinAlways"], _V175 + _PZ["riderChoice"], addl=False)
S["RiderSafetyUpdate"] = obj({"pinAlways": b(_V175 + "turn the PIN on all my rides on or off.")}, ["pinAlways"], _V175 + _PZ["riderChoice"], addl=False)
assert "safety" not in S["Rider"]["properties"] and "safety" not in S["RiderProfileUpdate"]["properties"], "safety exists before v0.18.175"
S["Rider"]["properties"]["safety"] = ref("RiderSafety")
S["RiderProfileUpdate"]["properties"]["safety"] = ref("RiderSafetyUpdate")
_TP175 = S["TripProjection"]["properties"]
assert "pinSource" not in _TP175, "TripProjection.pinSource exists before v0.18.175"
_TP175["pinSource"] = s(_V175 + _PZ["pinSource"], enum=_PZ["sources"])
_TP175["pinRequired"]["description"] = _TP175["pinRequired"].get("description", "") + " " + _V175 + _PZ["bookingRule"]
