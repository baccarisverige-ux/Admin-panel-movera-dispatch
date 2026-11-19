# Runs inside tools/gen_openapi.py in name order with its globals (rule 25 split). v0.18.135 (owner 2026-11-19 "Yes,
# build it now (Rec.)", Rules plan/NUMBERS.md): real sign-in codes by SMS (contract.json#smsSignIn). Additive: one
# optional CountryRules field (country standard only), wording on the code request, and (owner 2026-11-19 "6 digits
# (Rec.)") one optional answer field OtpChallenge.codeLength + the two verify bodies take a 4- or 6-digit code. No new route.
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
_LEN135 = sorted({AU["otp"]["codeLength"], _SSI["codeLength"]})
assert _LEN135 == [4, 6] and "codeLength" not in S["OtpChallenge"]["properties"], "code lengths before v0.18.135"
S["OtpChallenge"]["properties"]["codeLength"] = i(_V135 + "how many digits this code has: %d for a test number (auth.otp.codeLength), %d for a code sent by SMS (smsSignIn.codeLength). Missing = %d." % (AU["otp"]["codeLength"], _SSI["codeLength"], AU["otp"]["codeLength"]), enum=_LEN135)
S["OtpChallenge"]["description"] = "The code lives %d s; at most %d attempts. %sit is %d digits for a test number and %d digits when sent by SMS (codeLength)." % (AU["otp"]["expiresSeconds"], AU["otp"]["maxAttempts"], _V135, AU["otp"]["codeLength"], _SSI["codeLength"])
_CODE135 = "^(%s)$" % "|".join("[0-9]{%d}" % n for n in _LEN135)
for _n135 in ("OtpVerifyRequest", "AccountPhoneVerify"):
    assert S[_n135]["properties"]["code"]["pattern"] == "^[0-9]{%d}$" % AU["otp"]["codeLength"], _n135 + " code pattern before v0.18.135"
    S[_n135]["properties"]["code"]["pattern"] = _CODE135
