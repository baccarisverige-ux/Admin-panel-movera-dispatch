# Runs inside tools/gen_openapi.py in name order with its globals (rule 25 split). v0.18.174 (owner 2026-11-28 "When price
# more allways show", "No popup, book lower"): CreateTripRequest / RescheduleCommand.agreedQuoteId + priceAccepted, the
# 409 reason price_changed_ask (contract.json#priceChangeAsk). No money field is added.
_PCA = C["priceChangeAsk"]
_V174 = "v0.18.174 (contract.json#priceChangeAsk): "
for _name in ("CreateTripRequest", "RescheduleCommand"):
    _P174 = S[_name]["properties"]
    assert "agreedQuoteId" not in _P174 and "priceAccepted" not in _P174, _name + " has the v0.18.174 fields already"
    _P174["agreedQuoteId"] = {"allOf": [ref("Id")], "description": _V174 + "the quote whose price the rider last saw. " + _PCA["agreedQuote"] + " " + _PCA["oldApps"]}
    _P174["priceAccepted"] = b(_V174 + "the rider accepted the fresh (higher) price; a yes/no only, never an amount. Only meaningful with agreedQuoteId. " + _PCA["rule"])
    S[_name]["description"] += " " + _V174 + _PCA["request"]
_ER174 = S["Error"]["properties"]["reason"]
_ER174["description"] = _ER174.get("description", "") + " " + _V174 + "price_changed_ask (409 conflict, POST /trips and POST /trips/{tripId}/reschedule with agreedQuoteId): " + _PCA["reasons"]["price_changed_ask"]
_NCA = _PCA["noClientAmount"]
for _name in ("CreateTripRequest", "RescheduleCommand"):
    assert "not" not in S[_name], _name + " has a not already"
    S[_name]["not"] = {"anyOf": [{"required": [_f]} for _f in _NCA["fields"]]}
    S[_name]["description"] += " " + _NCA["rule"]
