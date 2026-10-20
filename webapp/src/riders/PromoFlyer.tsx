import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Download, Printer } from "lucide-react";
import type { PromoTicket } from "./care";
import { categoryName } from "./profile";
import { CURRENCY_SYMBOL } from "./ui";
import { tr, trn } from "../i18n";

type FlyerPromo = Pick<PromoTicket, "code" | "title" | "kind" | "value" | "rides" | "maxPerRide" | "validFrom" | "validTo" | "country" | "categories">;

const W = 420;
const H = 594;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

/** One path for all dark squares of the QR code, drawn in a size x size box. */
function qrPath(text: string, size: number): { d: string; cell: number } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / count;
  let d = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) d += `M${(col * cell).toFixed(2)} ${(row * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
    }
  }
  return { d, cell };
}

/** The flyer as a standalone SVG (A5 shape), so the same picture is shown, printed and downloaded. */
export function flyerSvg(promo: FlyerPromo, link: string, locale: string): string {
  const symbol = CURRENCY_SYMBOL[promo.country];
  const deal = promo.kind === "percent" ? `${promo.value}%` : `${promo.value} ${symbol}`;
  const rides = `your next ${promo.rides} ride${promo.rides === 1 ? "" : "s"}`;
  const cap = promo.kind === "percent" ? ` · up to ${promo.maxPerRide} ${symbol} per ride` : "";
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
  const valid = promo.validFrom && promo.validTo ? `Valid ${date.format(Date.parse(promo.validFrom))} – ${date.format(Date.parse(promo.validTo))}` : "";
  const cats = promo.categories.length ? promo.categories.map(categoryName).join(", ") : "All ride categories";
  const qr = qrPath(link || promo.code, 116);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Poppins, Arial, sans-serif">
  <defs>
    <linearGradient id="fl-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#215277"/><stop offset="1" stop-color="#2E86C1"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="#FFFFFF"/>
  <path d="M0 18a18 18 0 0 1 18-18h${W - 36}a18 18 0 0 1 18 18v232H0z" fill="url(#fl-top)"/>
  <circle cx="${W - 40}" cy="40" r="90" fill="#FFFFFF" opacity="0.07"/>
  <circle cx="30" cy="230" r="70" fill="#FFFFFF" opacity="0.06"/>
  <text x="32" y="54" fill="#FFFFFF" font-size="20" font-weight="700" letter-spacing="3">MOVERA</text>
  <text x="32" y="140" fill="#FFFFFF" font-size="68" font-weight="800">${escapeXml(deal)}</text>
  <text x="32" y="176" fill="#FFFFFF" font-size="26" font-weight="600">OFF ${escapeXml(rides.toUpperCase())}</text>
  <text x="32" y="212" fill="#D6E9F7" font-size="15">${escapeXml(promo.title || "Movera offer")}${escapeXml(cap)}</text>
  <text x="32" y="292" fill="#5C656C" font-size="13" font-weight="600" letter-spacing="1.5">YOUR CODE</text>
  <rect x="32" y="304" width="${W - 64}" height="64" rx="12" fill="#EEF5FB" stroke="#215277" stroke-width="2" stroke-dasharray="7 5"/>
  <text x="${W / 2}" y="347" text-anchor="middle" fill="#1D252C" font-size="32" font-weight="800" letter-spacing="4">${escapeXml(promo.code || "CODE")}</text>
  <g transform="translate(32 396)">
    <rect width="132" height="132" rx="10" fill="#FFFFFF" stroke="#E7EBEE"/>
    <path transform="translate(8 8)" d="${qr.d}" fill="#1D252C"/>
  </g>
  <g fill="#1D252C" font-size="13">
    <text x="184" y="414" font-weight="700" font-size="14">How to use it</text>
    <text x="184" y="442"><tspan font-weight="700" fill="#215277">1 </tspan>Scan the code or open Movera</text>
    <text x="184" y="466"><tspan font-weight="700" fill="#215277">2 </tspan>Account, then Vouchers</text>
    <text x="184" y="490"><tspan font-weight="700" fill="#215277">3 </tspan>Type ${escapeXml(promo.code || "the code")}</text>
    <text x="184" y="514"><tspan font-weight="700" fill="#215277">4 </tspan>Book your ride</text>
  </g>
  <line x1="32" y1="548" x2="${W - 32}" y2="548" stroke="#E7EBEE"/>
  <text x="32" y="568" fill="#5C656C" font-size="11">${escapeXml(valid)}</text>
  <text x="32" y="584" fill="#5C656C" font-size="11">${escapeXml(cats)} · one code per rider</text>
</svg>`;
}

/** Printable flyer with the code and a QR code. */
export function PromoFlyer({ promo, locale }: { promo: FlyerPromo; locale: string }) {
  const [link, setLink] = useState(`movera://promo/${promo.code}`);
  const svg = useMemo(() => flyerSvg(promo, link, locale), [promo, link, locale]);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  function download() {
    const anchor = document.createElement("a");
    anchor.href = src;
    anchor.download = `movera-${promo.code.toLowerCase()}-flyer.svg`;
    anchor.click();
  }

  function print() {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><title>${escapeXml(promo.code)} flyer</title><style>@page{size:A5;margin:0}body{margin:0;display:grid;place-items:center;height:100vh}svg{width:100%;height:auto;max-height:100vh}</style>${svg}`);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  }

  return (
    <div className="rd-flyer">
      <img className="rd-flyer-img" src={src} alt={tr("Flyer for {0}", [promo.code])} />
      <div className="rd-flyer-side">
        <label className="field">{trn("QR code opens{0}", <input aria-label={tr("QR code link")} value={link} onChange={(event) => setLink(event.target.value)} />)}</label>
        <small className="fine">{tr("Riders scan it with the phone camera. Use the app link or your web page.")}</small>
        <div className="cat-actions">
          <button data-command="admin.riders.flyer" type="button" className="dash-btn" onClick={print}>{trn("{0} Print", <Printer size={14} aria-hidden="true" />)}</button>
          <button data-command="admin.riders.flyer" type="button" className="dash-btn ghost" onClick={download}>{trn("{0} Download picture", <Download size={14} aria-hidden="true" />)}</button>
        </div>
        <small className="fine">{tr("A5 size. Print it, put it in cars, at the airport or share the picture on social media.")}</small>
      </div>
    </div>
  );
}
