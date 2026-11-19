# Runs inside tools/gen_openapi.py in name order with its globals (rule 25 split). v0.18.133 (S5 J12-J15, BQ-M05; owner
# 2026-11-19 "driver payout 3 lines", "carry line only when needed", "carry counts toward owed limit"): a payout is never
# paid below zero, the rest moves to the next payout; Payout carries its parts; GET /admin/payouts/runs gives the server's
# count and total of each waiting run (contract.json#payoutLines). Additive, behind CountryRules.payoutLinesOn (off).
_PL = C["payoutLines"]
_V133 = "v0.18.133 (payoutLines): "
_pp = S["Payout"]["properties"]
assert "paidOut" not in _pp and "carriedOut" not in _pp, "Payout lines exist before v0.18.133"
for _k, _d in (("earned", "Earned: what Movera holds for him in this payout. "), ("owedToMovera", "Owed to Movera, incl. carriedIn. "),
               ("paidOut", "Paid out (= amount, never below 0). "), ("carriedIn", "Taken from an earlier payout (moved to this one). "),
               ("carriedOut", "Moves to next week (shown only when > 0). ")):
    _pp[_k] = {"allOf": [ref("Money")], "description": _V133 + _d + "Present only on a payout made while CountryRules.payoutLinesOn was on; driver and admin. " + _PL["lines"]}
S["CountryRules"]["properties"]["payoutLinesOn"] = dflt(b(_V133 + _PL["switch"]), False)
S["PayoutRunCard"]["properties"].update({"periodStart": ref("Timestamp"), **{_k: arr(ref("Money"), description=_V133 + "summed per currency over every payout of the run.") for _k in ("earned", "owedToMovera", "paidOut", "carriedOut")}})
S["PayoutRunList"] = obj({"items": arr(ref("PayoutRunCard"))}, ["items"], _V133 + _PL["runs"])
op("get", "/admin/payouts/runs", "adminListPayoutRuns", "Payout runs waiting for approval (server count and total)", ["admin"], "Admin · Finance",
   params=[q("country", s(pattern="^[A-Z]{2}$"))], ok=(200, "PayoutRunList"), permission="finance.read", read_only=True,
   desc=_V133 + _PL["runs"] + " " + _PL["once"])
PATHS["/admin/payouts/runs/approve"]["post"]["description"] += " " + _V133 + "approve with the count and total of GET /admin/payouts/runs."
# Review M1: payoutLinesOn is a kept key of country_rules (save and Restore keep it); removeKeys may name it.
_rk133 = S["ConfigDraftUpdate"]["properties"]["removeKeys"]
assert "payoutLinesOn" in C["configDocs"]["keptKeys"]["country_rules"], "payoutLinesOn is a kept key"
_rk133["items"]["enum"] = sorted(set(_rk133["items"]["enum"]) | {"payoutLinesOn"})
_rk133["maxItems"] = len(_rk133["items"]["enum"])
PATHS["/admin/config/{doc}"]["put"]["description"] += " " + _V133 + "country_rules keeps payoutLinesOn (configDocs.keptKeys.country_rules): " + _PL["switch"]
PATHS["/admin/config/{doc}/restore"]["post"]["description"] += " " + _V133 + "Restore keeps payoutLinesOn (pricingHistory.restoreKeeps)."
