# Runs inside tools/gen_openapi.py in name order with its globals (rule 25 split). v0.18.138 (owner 2026-11-20 "Ok",
# Rules plan/NUMBERS.md): SMS abuse guards (contract.json#deviceCheck). Additive: two optional OtpRequest fields
# (installId, deviceCheck), one optional CountryRules.smsSignIn field (requireDeviceCheck); the per-install code limit
# reaches CountryLimits from contract.json#countryLimits by itself. No new route.
_DC = C["deviceCheck"]
_V138 = "v0.18.138 (contract.json#deviceCheck): "
assert "installId" not in S["OtpRequest"]["properties"] and "deviceCheck" not in S["OtpRequest"]["properties"], "OtpRequest device fields exist before v0.18.138"
S["OtpRequest"]["properties"]["installId"] = s(_V138 + _DC["installId"], pattern=r"^[A-Za-z0-9_-]{16,64}$")
S["DeviceCheck"] = obj(OrderedDict([
    ("platform", s("Which check this is.", enum=["android", "ios"])),
    ("token", s("Android: the Play Integrity token. iPhone: the App Attest attestation object, base64.", minLength=1, maxLength=16384)),
    ("keyId", s("iPhone only: the App Attest key id, base64.", minLength=1, maxLength=128)),
]), ["platform", "token"], _V138 + _DC["check"] + " " + _DC["binding"], addl=False)
S["OtpRequest"]["properties"]["deviceCheck"] = {"allOf": [ref("DeviceCheck")], "description": _V138 + _DC["setting"]}
_p138 = S["CountryRules"]["properties"]["smsSignIn"]["properties"]
assert "requireDeviceCheck" not in _p138, "smsSignIn.requireDeviceCheck exists before v0.18.138"
_p138["requireDeviceCheck"] = {**b("Real-phone check before a sign-in SMS (Play Integrity / App Attest). " + _DC["ios"]["note"]), "default": C["configDefaults"]["smsSignIn"]["requireDeviceCheck"]}
_op138 = PATHS["/auth/otp/request"]["post"]
_op138["description"] = (_op138.get("description", "") + " " + _V138 + _DC["deviceLimit"] + " " + _DC["errors"]["device_check_failed"] + " " + _DC["order"]).strip()
for _k138 in ("installId", "deviceCheck"):
    assert _k138 not in S["AccountPhoneChange"]["properties"], "AccountPhoneChange device fields exist before v0.18.138"
    S["AccountPhoneChange"]["properties"][_k138] = S["OtpRequest"]["properties"][_k138]
S["AccountPhoneChange"]["description"] = (S["AccountPhoneChange"].get("description", "") + " " + _V138 + _DC["phoneChange"]).strip()
