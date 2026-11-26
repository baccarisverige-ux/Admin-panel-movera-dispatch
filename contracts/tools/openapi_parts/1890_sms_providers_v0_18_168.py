# Runs inside tools/gen_openapi.py in name order with its globals (rule 25 split). v0.18.168 (owner 2026-11-26 "Am going to
# change company sms to infobip", "Infobip + 46elks en secours (Recommande)"): Infobip first, 46elks as backup; one optional
# providerOrder on both SMS sign-in settings (contract.json#smsProviders). No new route.
_SP = C["smsProviders"]
_V168 = "v0.18.168 (contract.json#smsProviders): "
for _n168 in ("smsSignIn", "smsSignInOtherCountries"):
    _p168 = S["CountryRules"]["properties"][_n168]["properties"]
    assert "providerOrder" not in _p168, _n168 + ".providerOrder exists before v0.18.168"
    _p168["providerOrder"] = arr(s(enum=list(_SP["providers"])), minItems=1, maxItems=len(_SP["providers"]), uniqueItems=True,
                                 default=list(_SP["defaultOrder"]), description=_V168 + _SP["setting"] + " " + _SP["fallback"])
_op168 = PATHS["/auth/otp/request"]["post"]
_op168["description"] = (_op168.get("description", "") + " " + _V168 + _SP["fallback"]).strip()
