import type { MessageKey } from "./en.ts";
import { frA0Symbols } from "./fr/a0-symbols.ts";
import { frA1A } from "./fr/a1-a.ts";
import { frA2BC } from "./fr/a2-b-c.ts";
import { frA3DE } from "./fr/a3-d-e.ts";
import { frA4FL } from "./fr/a4-f-l.ts";
import { frA5MN } from "./fr/a5-m-n.ts";
import { frA6OP } from "./fr/a6-o-p.ts";
import { frA7QR } from "./fr/a7-q-r.ts";
import { frA8S } from "./fr/a8-s.ts";
import { frA9T } from "./fr/a9-t.ts";
import { frA10UZ } from "./fr/a10-u-z.ts";
import { frB1LanguageSwitch } from "./fr/b1-language-switch.ts";
import { frB2PickupPay } from "./fr/b2-pickup-pay.ts";
import { frB3LiveMapPins } from "./fr/b3-live-map-pins.ts";
import { frB4RadarExclusiveReservations } from "./fr/b4-radar-exclusive-reservations.ts";
import { frB5HandlePanel } from "./fr/b5-handle-panel.ts";
import { frB6AddMoneyOfferStatus } from "./fr/b6-add-money-offer-status.ts";
import { frB7SurgeLiveMap } from "./fr/b7-surge-live-map.ts";
import { frB8DriverMoneySupplyDemand } from "./fr/b8-driver-money-supply-demand.ts";
import { frC1ContractV072Part1 } from "./fr/c1-contract-v072-part1.ts";
import { frC1ContractV072Part2 } from "./fr/c1-contract-v072-part2.ts";
import { frC1ContractV072Part3 } from "./fr/c1-contract-v072-part3.ts";
import { frC1ContractV072Part4 } from "./fr/c1-contract-v072-part4.ts";
import { frC2RequestLimits } from "./fr/c2-request-limits.ts";
import { frC3RealAppPreview } from "./fr/c3-real-app-preview.ts";
import { frC4PhoneData } from "./fr/c4-phone-data.ts";
import { frC5AfterTestRules } from "./fr/c5-after-test-rules.ts";
import { frC2RidersPaymentsPayouts } from "./fr/c2-riders-payments-payouts.ts";
import { frC2Job7SmallFixes } from "./fr/c2-job7-small-fixes.ts";
import { frC2ServerAlerts } from "./fr/c2-server-alerts.ts";
import { frC5BookedRideLive } from "./fr/c5-booked-ride-live.ts";
import { frC2AdminLiveDrivers } from "./fr/c2-admin-live-drivers.ts";
import { frC6Job4TakeBack } from "./fr/c6-job4-take-back.ts";
import { frC7AirportQueue } from "./fr/c7-airport-queue.ts";
import { frC6InAppCalls } from "./fr/c6-in-app-calls.ts";
import { frC8NoDriverNearby } from "./fr/c8-no-driver-nearby.ts";
import { frC9BlockedPairs } from "./fr/c9-blocked-pairs.ts";
import { frC9SameAddress } from "./fr/c9-same-address.ts";
import { frC10Lifecycle } from "./fr/c10-lifecycle.ts";
import { frC11BookedWaiting } from "./fr/c11-booked-waiting.ts";
import { frC12AdminMasking } from "./fr/c12-admin-masking.ts";
import { frC13EmergencyNumbers } from "./fr/c13-emergency-numbers.ts";
import { frC13ChatG92 } from "./fr/c13-chat-g92.ts";
import { frC14EmailVerified } from "./fr/c14-email-verified.ts";
import { frC15WaitingPriceShown } from "./fr/c15-waiting-price-shown.ts";
import { frC16DriverPayJ6 } from "./fr/c16-driver-pay-j6.ts";
import { frC17LanguageFallback } from "./fr/c17-language-fallback.ts";
import { frC16CommissionSteps } from "./fr/c16-commission-steps.ts";
import { frC17TipWindowRefundNotice } from "./fr/c17-tip-window-refund-notice.ts";
import { frC18MoneyM24 } from "./fr/c18-money-m24.ts";
import { frC18AutoArrive } from "./fr/c18-auto-arrive.ts";
import { frC19MoneyA26 } from "./fr/c19-money-a26.ts";
import { frC20V45O15Cleanup } from "./fr/c20-v45-o15-cleanup.ts";
import { frC21RideCheckCadence } from "./fr/c21-ride-check-cadence.ts";
import { frC22SosContactsSms } from "./fr/c22-sos-contacts-sms.ts";
import { frC23PayoutRunGuard } from "./fr/c23-payout-run-guard.ts";
import { frC27StopAutoArrive } from "./fr/c27-stop-auto-arrive.ts";
import { frC24FleetCountry } from "./fr/c24-fleet-country.ts";
import { frC28OfflineReasons } from "./fr/c28-offline-reasons.ts";
import { frC19DebtModel } from "./fr/c19-debt-model.ts";
import { frC25BonusCampaigns } from "./fr/c25-bonus-campaigns.ts";
import { frC29SupportOrder } from "./fr/c29-support-order.ts";
import { frC33TipsLimitsUndo } from "./fr/c33-tips-limits-undo.ts";
import { frC35WhereItLands } from "./fr/c35-where-it-lands.ts";
import { frC38FromTo } from "./fr/c38-from-to.ts";
import { frC39ConfirmDetails } from "./fr/c39-confirm-details.ts";
import { frC31PickupSpots } from "./fr/c31-pickup-spots.ts";
import { frC39ParkedGeofence } from "./fr/c39-parked-geofence.ts";
import { frC32ShareTrip } from "./fr/c32-share-trip.ts";
import { frC37AutoOfflineOutage } from "./fr/c37-auto-offline-outage.ts";
import { frC40OneStream } from "./fr/c40-one-stream.ts";
import { frC41LaneLate } from "./fr/c41-lane-late.ts";
import { frC47PayRequest } from "./fr/c47-pay-request.ts";

/** French. Same keys as en.ts (the compiler checks it); placeholders like {0} are kept, a plural ending may be left out. */
/** Split by area (base job, rule 25) into ./fr/*.ts with no text change; add a key to the area file it belongs to (see the PR note). */
export const fr: Record<MessageKey, string> = {
  ...frA0Symbols,
  ...frA1A,
  ...frA2BC,
  ...frA3DE,
  ...frA4FL,
  ...frA5MN,
  ...frA6OP,
  ...frA7QR,
  ...frA8S,
  ...frA9T,
  ...frA10UZ,
  ...frB1LanguageSwitch,
  ...frB2PickupPay,
  ...frB3LiveMapPins,
  ...frB4RadarExclusiveReservations,
  ...frB5HandlePanel,
  ...frB6AddMoneyOfferStatus,
  ...frB7SurgeLiveMap,
  ...frB8DriverMoneySupplyDemand,
  ...frC1ContractV072Part1,
  ...frC1ContractV072Part2,
  ...frC1ContractV072Part3,
  ...frC1ContractV072Part4,
  ...frC2RequestLimits,
  ...frC3RealAppPreview,
  ...frC4PhoneData,
  ...frC5AfterTestRules,
  ...frC2RidersPaymentsPayouts,
  ...frC2Job7SmallFixes,
  ...frC2ServerAlerts,
  ...frC5BookedRideLive,
  ...frC2AdminLiveDrivers,
  ...frC6Job4TakeBack,
  ...frC7AirportQueue,
  ...frC6InAppCalls,
  ...frC8NoDriverNearby,
  ...frC9BlockedPairs,
  ...frC9SameAddress,
  ...frC10Lifecycle,
  ...frC11BookedWaiting,
  ...frC12AdminMasking,
  ...frC13EmergencyNumbers,
  ...frC13ChatG92,
  ...frC14EmailVerified,
  ...frC15WaitingPriceShown,
  ...frC16DriverPayJ6,
  ...frC17LanguageFallback,
  ...frC16CommissionSteps,
  ...frC17TipWindowRefundNotice,
  ...frC18MoneyM24,
  ...frC18AutoArrive,
  ...frC19MoneyA26,
  ...frC20V45O15Cleanup,
  ...frC21RideCheckCadence,
  ...frC22SosContactsSms,
  ...frC23PayoutRunGuard,
  ...frC27StopAutoArrive,
  ...frC24FleetCountry,
  ...frC28OfflineReasons,
  ...frC19DebtModel,
  ...frC25BonusCampaigns,
  ...frC29SupportOrder,
  ...frC33TipsLimitsUndo,
  ...frC35WhereItLands,
  ...frC38FromTo,
  ...frC39ConfirmDetails,
  ...frC31PickupSpots,
  ...frC39ParkedGeofence,
  ...frC32ShareTrip,
  ...frC37AutoOfflineOutage,
  ...frC40OneStream,
  ...frC41LaneLate,
  ...frC47PayRequest,
};
