# Runs inside tools/gen_openapi.py in name order with its globals (rule 25 split). v0.18.135 (owner 2026-11-19 "Yes,
# build it now (Rec.)", Rules plan/NUMBERS.md): real sign-in codes by SMS (contract.json#smsSignIn). Additive: one
# optional CountryRules field (country standard only) and wording on the code request. No new route or answer shape.
_SSI = C["smsSignIn"]
_V135 = "v0.18.135 (contract.json#smsSignIn): "
assert "smsSignIn" not in S["CountryRules"]["properties"], "CountryRules.smsSignIn exists before v0.18.135"
S["CountryRules"]["properties"]["smsSignIn"] = obj(OrderedDict([
    ("enabled", {**b("Real SMS sign-in codes for this country's numbers."), "default": C["configDefaults"]["smsSignIn"]["enabled"]}),
    ("dailyCap", i("Sign-in SMS per 24 hours for this country before new codes are refused (sms_daily_limit).",
                   minimum=_SSI["dailyCapRange"][0], maximum=_SSI["dailyCapRange"][1], default=C["configDefaults"]["smsSignIn"]["dailyCap"])),
]), [], _V135 + _SSI["setting"], addl=False)
_op135 = PATHS["/auth/otp/request"]["post"]
_op135["description"] = (_op135.get("description", "") + " " + _V135 + _SSI["active"] + " " + _SSI["dailyCap"] + " " + _SSI["delivery"]).strip()
