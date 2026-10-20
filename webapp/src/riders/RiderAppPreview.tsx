import { useState } from "react";
import { CalendarClock, Car, ChevronRight, Clock, CreditCard, Gift, Map, MapPin, Search, UserRound, Users, X } from "lucide-react";
import { formatMoney, market, type MarketId } from "../markets/markets";
import { promoPrice, type PromoTicket } from "./care";
import type { CategoryPrice } from "./useCategoryPrices";
import { CURRENCY_SYMBOL } from "./ui";
import { tr, trn, trx } from "../i18n";

/** Pictures the rider app already ships, used as the promotion's thumbnail. */
export const CARD_IMAGES: { id: string; label: string; file: string | null }[] = [
  { id: "gradient", get label() { return tr("Movera colours"); }, file: null },
  { id: "comfort", get label() { return tr("Comfort ride"); }, file: "movera_comfort_ride.webp" },
  { id: "airport", get label() { return tr("Airport"); }, file: "movera_airport_premium.webp" },
  { id: "events", get label() { return tr("Events"); }, file: "movera_events_premium.webp" },
  { id: "business", get label() { return tr("Work"); }, file: "movera_business_premium.webp" },
  { id: "outings", get label() { return tr("Outings"); }, file: "movera_outings_premium.webp" },
];

export function imageUrl(id: string | undefined): string | null {
  const file = CARD_IMAGES.find((item) => item.id === id)?.file;
  return file ? `${import.meta.env.BASE_URL}rider-app/${file}` : null;
}

type Promo = Pick<PromoTicket, "title" | "kind" | "value" | "rides" | "maxPerRide" | "minFare" | "country" | "categories"> & { image?: string; code?: string };

export function promoSubtitle(promo: Promo): string {
  const symbol = CURRENCY_SYMBOL[promo.country as MarketId];
  const deal = promo.kind === "percent" ? `${promo.value}% off` : `${promo.value} ${symbol} off`;
  return `${deal} your next ${promo.rides} ride${promo.rides === 1 ? "" : "s"}${promo.kind === "percent" ? ` · up to ${promo.maxPerRide} ${symbol}` : ""}`;
}

function money(value: number, country: MarketId): string {
  return formatMoney(Math.round(value * market(country).minorUnits), country);
}

/**
 * The rider app with the promotion: on Home it is a small tab on top of the sheet;
 * on Choose ride every category it covers shows the old price crossed out and the new price.
 */
export function RiderAppPreview({ promo, prices = [], zoneName = "", off = false, popup = false }: { promo: Promo; prices?: CategoryPrice[]; zoneName?: string; off?: boolean; popup?: boolean }) {
  const [picked, setScreen] = useState<"home" | "ride" | "popup">(popup ? "popup" : "home");
  const screen = picked === "popup" && !popup ? "home" : picked;
  const country = promo.country as MarketId;
  const url = imageUrl(promo.image);
  const deal = promo.kind === "percent" ? `${promo.value}%` : `${promo.value} ${CURRENCY_SYMBOL[country]}`;
  const covered = prices.filter((row) => promoPrice(row.price, row.id, promo).applies).length;
  return (
    <figure className="ra-phone" aria-label={tr("How riders see the promotion")}>
      <div className="ra-switch" role="tablist" aria-label={tr("Rider app screen")}>
        <button data-command="admin.ui.quickAction" type="button" role="tab" aria-selected={screen === "home"} className={screen === "home" ? "active" : undefined} onClick={() => setScreen("home")}>{tr("Home")}</button>
        <button data-command="admin.ui.quickAction" type="button" role="tab" aria-selected={screen === "ride"} className={screen === "ride" ? "active" : undefined} onClick={() => setScreen("ride")}>{tr("Choose ride")}</button>
        {popup ? <button data-command="admin.ui.quickAction" type="button" role="tab" aria-selected={screen === "popup"} className={screen === "popup" ? "active" : undefined} onClick={() => setScreen("popup")}>{tr("Popup")}</button> : null}
      </div>
      <div className="ra-screen">
        <div className="ra-status"><span>9:41</span><span className="ra-notch" aria-hidden="true" /><span>5G</span></div>
        {screen === "popup" ? (
          <>
            <div className="ra-map dim" aria-hidden="true">
              <i className="ra-road r1" /><i className="ra-road r2" /><i className="ra-road r3" /><i className="ra-road r4" />
            </div>
            <div className="ra-popup" role="group" aria-label={tr("Popup in the rider app")}>
              <span className="ra-popup-close" aria-hidden="true"><X size={12} /></span>
              <div className={url ? "ra-popup-art photo" : "ra-popup-art"} style={url ? { backgroundImage: `url(${url})` } : undefined}>
                <strong>{deal}</strong><span>{tr("off")}</span>
              </div>
              <b>{promo.title || tr("Movera offer")}</b>
              <span>{promoSubtitle(promo)}</span>
              {promo.code ? <em className="ra-popup-code">{promo.code}</em> : null}
              <span className="ra-popup-btn">{tr("Use it now")}</span>
              <small>{tr("Maybe later")}</small>
            </div>
          </>
        ) : screen === "home" ? (
          <>
            <div className="ra-map" aria-hidden="true">
              <i className="ra-road r1" /><i className="ra-road r2" /><i className="ra-road r3" /><i className="ra-road r4" />
              <span className="ra-pin" />
            </div>
            <div className="ra-sheet">
              {off ? null : (
                <div className="ra-promo-tab" aria-label={tr("Promotion in the rider app")}>
                  <span className={url ? "ra-promo-icon photo" : "ra-promo-icon"} style={url ? { backgroundImage: `url(${url})` } : undefined}><Gift size={13} aria-hidden="true" /></span>
                  <span className="ra-promo-text">
                    <strong>{trn("{0} off · {1}", deal, promo.title || tr("Movera offer"))}</strong>
                    <span>{promoSubtitle(promo)}</span>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </div>
              )}
              <span className="ra-grabber" aria-hidden="true" />
              <div className="ra-where">
                <span className="ra-where-main">{trn("{0}Where to?", <Search size={14} aria-hidden="true" />)}</span>
                <span className="ra-later">{trn("{0}Later", <Clock size={11} aria-hidden="true" />)}</span>
              </div>
              <nav className="ra-nav" aria-hidden="true">
                <span className="on">{trn("{0}Map", <Map size={15} />)}</span>
                <span>{trn("{0}Payment", <CreditCard size={15} />)}</span>
                <span>{trn("{0}Schedule ride", <CalendarClock size={15} />)}</span>
                <span>{trn("{0}Account", <UserRound size={15} />)}</span>
              </nav>
            </div>
          </>
        ) : (
          <div className="ra-ride">
            <div className="ra-route">
              <span>{trn("{0}Current location", <i className="dot a" />)}</span>
              <span>{trn("{0}{1} · 8 km", <MapPin size={11} aria-hidden="true" />, zoneName || tr("Destination"))}</span>
            </div>
            {off ? null : <div className="ra-ride-banner">{trn("{0}{1} off applied on {2} categor{3}", <Gift size={12} aria-hidden="true" />, deal, covered, covered === 1 ? tr("y") : tr("ies"))}</div>}
            <ul className="ra-cats" aria-label={tr("Categories with prices")}>
              {prices.map((row, index) => {
                const result = off ? { applies: false, discount: 0, newPrice: row.price } : promoPrice(row.price, row.id, promo);
                return (
                  <li key={row.id} className={index === 0 ? "on" : undefined}>
                    <span className="ra-cat-car" aria-hidden="true"><Car size={18} /></span>
                    <span className="ra-cat-name"><b>{trx(row.label)}</b><small>{trn("{0}{1} · {2} min", <Users size={9} aria-hidden="true" />, row.seats, 3 + (index % 5))}</small></span>
                    <span className="ra-cat-price">
                      {result.applies ? <s>{money(row.price, country)}</s> : null}
                      <b className={result.applies ? "deal" : undefined}>{money(result.newPrice, country)}</b>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="ra-choose">{trn("Choose {0}", trx(prices[0]?.label) ?? tr("ride"))}</div>
          </div>
        )}
      </div>
      <figcaption>{off ? tr("Promotion is off: riders do not see it.") : screen === "popup" ? tr("Popup · shows once when the rider opens the app") : screen === "home" ? tr("Home · sheet down, promotion on top") : tr("Choose ride · sample 8 km trip in {0}", [zoneName])}</figcaption>
    </figure>
  );
}
