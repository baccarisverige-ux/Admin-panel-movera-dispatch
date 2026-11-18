/**
 * The "From → to" line of the confirm "!" (ui/ConfirmInfoBody.tsx), in the admin's language (cfgundo SF-R4-3; owner
 * 2026-11-16 08:48: the confirm-dialog texts keep sv / fr / en). Built from the values with the templates of the i18n
 * area c38, never from the English audit text. The audit text sent to the server stays English (CommandButton
 * `before` / `after`). Only ConfirmInfoBody imports this file, so it is loaded with the "!", not in the first download;
 * the other files import its types only.
 */
import { currentLanguage, tr, trx } from "../i18n/core.ts";
import { COUNTRY_LABEL } from "../i18n/countries.ts";
import type { AppLanguage, ZonePaymentMethod } from "../config/zoneDefaults.ts";
import type { AmountOption, CountrySettings, LanguageApp } from "../config/countrySettings.ts";
import type { MarketId } from "../markets/markets.ts";

type TipsPart = Pick<CountrySettings, "tips" | "raiseSteps" | "promoCap" | "driverBonusLimit">;
type AppsPart = { paymentMethods: Readonly<Record<ZonePaymentMethod, boolean>>; languages: Readonly<Record<LanguageApp, AppLanguage | string>> };

/** What a confirm dialog changes, as values. `audit`: only the English audit words are known. */
export type ChangeOf =
  | { kind: "tipsLimits"; country: MarketId; before: TipsPart; after: TipsPart }
  | { kind: "countryApps"; before: Partial<Record<MarketId, AppsPart>>; after: Partial<Record<MarketId, AppsPart>> }
  | { kind: "audit"; before: string; after: string };

const SYMBOL: Record<MarketId, string> = { SE: "kr", FR: "€", TN: "DT" };
const METHOD = { cash: "Pay in car", card: "Card", apple_pay: "Apple Pay" } as const;
const APP = { rider: "Rider app", driver: "Driver app", admin: "Admin panel" } as const;
const LANGUAGE = { en: "English", fr: "French", sv: "Swedish" } as const;

const short = (value: number) => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3))));
const list = (items: readonly AmountOption[], symbol: string, plus = "") => `${plus}${items.map((item) => (item.enabled ? short(item.amount) : tr("{0} (off)", [short(item.amount)]))).join(", ")} ${symbol}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const line = (label: string, from: string, to: string) => tr("{0}: {1} → {2}", [label, from, to]);

/**
 * Audit words with no letters but a unit (120 kr, 5 min, 3 km, 40 %) read the same in every language and are kept.
 * Anything else is English and is not shown in sv / fr.
 */
const NEUTRAL = /^[^\p{L}]*(?:\s?(?:kr|DT|min|km))?[^\p{L}]*$/u;

/** The lines of the "From → to" row, in the current language; empty when nothing changes. */
export function fromToLines(change: ChangeOf): string[] {
  if (change.kind === "audit") {
    const { before, after } = change;
    if (!before || !after || before === after) return [];
    if (currentLanguage() === "en" || (NEUTRAL.test(before) && NEUTRAL.test(after))) return [`${before} → ${after}`];
    return [tr("Values before → after: see the Audit log.")];
  }
  if (change.kind === "tipsLimits") {
    const { before, after } = change;
    const symbol = SYMBOL[change.country];
    const cap = (value: number | null) => (value === null ? tr("none") : `${short(value)} ${symbol}`);
    return [
      same(before.tips, after.tips) ? "" : line(tr("Tips"), list(before.tips, symbol), list(after.tips, symbol)),
      same(before.raiseSteps, after.raiseSteps) ? "" : line(tr("Raise-offer quick steps"), list(before.raiseSteps, symbol, "+"), list(after.raiseSteps, symbol, "+")),
      before.promoCap === after.promoCap ? "" : line(tr("Promo cap"), cap(before.promoCap), cap(after.promoCap)),
      before.driverBonusLimit === after.driverBonusLimit ? "" : line(tr("Driver bonus limit"), `${short(before.driverBonusLimit)} ${symbol}`, `${short(after.driverBonusLimit)} ${symbol}`),
    ].filter(Boolean);
  }
  const onOff = (value: boolean) => tr(value ? "on" : "off");
  const language = (code: string) => (code in LANGUAGE ? tr(LANGUAGE[code as keyof typeof LANGUAGE]) : code);
  return (Object.keys(COUNTRY_LABEL) as MarketId[]).flatMap((country) => {
    const before = change.before[country];
    const after = change.after[country];
    if (!before || !after) return [];
    const name = trx(COUNTRY_LABEL[country]);
    return [
      ...(Object.keys(METHOD) as ZonePaymentMethod[]).filter((method) => Boolean(before.paymentMethods[method]) !== Boolean(after.paymentMethods[method])).map((method) => `${name} · ${line(tr(METHOD[method]), onOff(Boolean(before.paymentMethods[method])), onOff(Boolean(after.paymentMethods[method])))}`),
      ...(Object.keys(APP) as LanguageApp[]).filter((app) => before.languages[app] !== after.languages[app]).map((app) => `${name} · ${line(tr("{0}, default language", [tr(APP[app])]), language(before.languages[app]), language(after.languages[app]))}`),
    ];
  });
}
