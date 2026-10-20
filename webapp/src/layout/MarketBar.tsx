import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, MapPinned, Plane } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { MARKETS, zoneById, zoneGroups, type MarketId } from "../markets/markets";
import { allowedCountries, zoneAllowed } from "../markets/scope";
import { rememberCountry, useMarketScope } from "../markets/useMarketScope";
import { Flag } from "../ui/Flag";
import { tr, trn, trx } from "../i18n";
import { COUNTRY_LABEL } from "../i18n/countries";

/** Top-bar country switch followed by the zone picker for that country. */
export function MarketBar() {
  const { agent } = useSession();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const scope = useMarketScope();
  const access = agent?.scope ?? { zones: "all" as const };
  const countries = allowedCountries(access);
  const [open, setOpen] = useState(false);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (popover.current && !popover.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function chooseCountry(id: MarketId) {
    if (id === scope.country && !scope.zones.length) return;
    rememberCountry(agent?.id, id);
    client.clear();
    const next = new URLSearchParams(params);
    next.set("country", id);
    next.delete("scope");
    setParams(next);
  }

  function setZones(zones: string[]) {
    client.clear();
    const next = new URLSearchParams(params);
    next.set("country", scope.country);
    if (zones.length) next.set("scope", zones.join(","));
    else next.delete("scope");
    setParams(next);
  }

  function toggle(zoneId: string) {
    const picked = new Set(scope.zones);
    if (picked.has(zoneId)) picked.delete(zoneId);
    else picked.add(zoneId);
    setZones(Array.from(picked));
  }

  const groups = zoneGroups(scope.country, (zoneId) => zoneAllowed(access, zoneId));
  const label = scope.zones.length === 0
    ? tr("All zones")
    : scope.zones.length === 1
      ? zoneById(scope.zones[0])?.name ?? scope.zones[0]
      : tr("{0} zones", [scope.zones.length]);

  return (
    <div className="market-bar">
      <div className="country-switch" role="radiogroup" aria-label={tr("Country")}>
        {MARKETS.filter((item) => countries.includes(item.id)).map((item) => (
          <button data-command="admin.ui.country"
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.id === scope.country}
            className={item.id === scope.country ? "active" : undefined}
            onClick={() => chooseCountry(item.id)}
            title={`${item.name} · ${item.currency}`}
          >
            <Flag id={item.id} />
            <span className="country-name">{trx(COUNTRY_LABEL[item.id])}</span>
          </button>
        ))}
      </div>
      <div className="zone-picker" ref={popover}>
        <button data-command="admin.ui.zones" type="button" className="zone-trigger" aria-haspopup="true" aria-expanded={open} aria-label={tr("Zones: {0}", [label])} onClick={() => setOpen((value) => !value)}>
          <MapPinned size={15} aria-hidden="true" />
          <span>{trx(label)}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open ? (
          <div className="zone-menu" role="group" aria-label={tr("Zones in {0}", [trx(COUNTRY_LABEL[scope.market.id])])}>
            <button data-command="admin.ui.zones" type="button" className={scope.zones.length ? "zone-option" : "zone-option checked"} onClick={() => setZones([])}>{trn("{0}All zones in {1}", <span className="zone-check">{scope.zones.length ? null : <Check size={13} aria-hidden="true" />}</span>, trx(COUNTRY_LABEL[scope.market.id]))}</button>
            {groups.map((group) => (
              <div key={group.label} className="zone-group">
                <p>{trx(group.label)}</p>
                {group.zones.map((zone) => {
                  const checked = scope.zones.includes(zone.id);
                  return (
                    <label key={zone.id} className={checked ? "zone-option checked" : "zone-option"}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(zone.id)} />
                      <span className="zone-check">{checked ? <Check size={13} aria-hidden="true" /> : null}</span>
                      {zone.kind === "airport" ? <Plane size={13} aria-hidden="true" /> : null}
                      {zone.name}
                      <code>{zone.id}</code>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
