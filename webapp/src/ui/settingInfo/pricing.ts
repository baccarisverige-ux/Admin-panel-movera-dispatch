import type { SettingInfoText } from "../SettingInfo.ts";

/**
 * English "i" texts, Pricing (Prices, Fees, Surge, Commission, Pickup pay, car types). Written from the code:
 * pricing/zonePricing.ts (defaultCategoryPrice, defaultZoneBook, PRICE_MAX_SEK, FEE_MAX_SEK, validateZoneBook),
 * pricing/pickupPay.ts (defaultPickupPay, PICKUP_OFFERS), pricing/commissionSteps.ts + contract.json#commissionSteps.
 * Money defaults are Sweden's; France and Tunisia get the same value converted (× 0.095 € and × 0.3 DT, rounded).
 */
const t = (what: string, where: string, range: string, example: string): SettingInfoText => ({ what, where, range, example });

const ZONE = "Pricing: the zone picked at the top, or the country Standard (used by every zone without its own prices); riders see it in the rider app after Publish.";
const ZONE_DRIVER = "Pricing: the zone picked at the top, or the country Standard (used by every zone without its own prices); it changes what drivers earn, after Publish.";
const SURGE = "Pricing › Surge, for the zone picked at the top (or the country Standard). Riders in that zone see the higher price in the rider app.";
const MONEY = "Money in the zone's currency, VAT included.";

export const PRICING_INFO: Readonly<Record<string, SettingInfoText>> = {
  "pricing.categoryOn": t(
    "Turns a car type on or off in this zone. When it is off, riders in the zone cannot pick it.",
    ZONE,
    "On or off. Default: on for the built-in car types.",
    "Turn Pet off in a zone where no driver takes pets.",
  ),
  "pricing.price.base": t(
    "The start price of every ride, before km and minutes are added.",
    ZONE,
    `${MONEY} Must be above 0; at most 1 000 kr (about 95 € or 300 DT). Default: Movera 29 kr, other car types more (Premium × 1.8); airport zones × 1.3.`,
    "Base 29 kr + 8 km × 12 kr + 18 min × 4 kr = 197 kr before limits and fees.",
  ),
  "pricing.price.perKm": t(
    "The price for each km of the trip.",
    ZONE,
    `${MONEY} 0 to 100 kr per km (about 9.5 € or 30 DT). Default: Movera 12 kr per km, other car types more.`,
    "At 12 kr per km a 10 km trip adds 120 kr.",
  ),
  "pricing.price.perMin": t(
    "The price for each minute of the trip.",
    ZONE,
    `${MONEY} 0 to 50 kr per minute. Default: Movera 4 kr per minute, other car types more.`,
    "At 4 kr per minute a 20 minute trip adds 80 kr.",
  ),
  "pricing.price.freeWaitMin": t(
    "How long the driver waits at the pickup for free. It is also the no-show wait: after it the driver can mark a no-show.",
    ZONE,
    "Minutes, 0 to 30. Default: 5 min, Movera XL 3 min, airport zones 5 min.",
    "With 5 min the rider pays waiting only from minute 6.",
  ),
  "pricing.price.waitPerMin": t(
    "What the rider pays per minute of waiting at the pickup after the free time. 100% goes to the driver.",
    ZONE,
    `${MONEY} 0 to 50 kr per minute; the rider pays it plus the app fee. Default: 12.26 kr (Premium 16.90 kr).`,
    "8 minutes waited with 5 free = 3 × 12.26 kr.",
  ),
  "pricing.price.stopWaitPerMin": t(
    "What the rider pays per minute while the driver waits at a stop on the way.",
    ZONE,
    `${MONEY} 0 to 50 kr per minute. Default: 5 kr per minute for Movera.`,
    "4 minutes at a stop = 4 × 5 kr.",
  ),
  "pricing.price.noShowFee": t(
    "What the rider pays when the driver marks a no-show after the free waiting time.",
    ZONE,
    `${MONEY} 0 to 1 000 kr. Default: 65 kr.`,
    "The rider never comes out: the driver marks no-show and the rider pays 65 kr.",
  ),
  "pricing.price.extraStopFee": t(
    "A fixed amount added for each extra stop on the trip.",
    ZONE,
    `${MONEY} 0 to 500 kr. Default: 15 kr for Movera, other car types more.`,
    "A trip with 2 extra stops adds 2 × 15 kr.",
  ),
  "pricing.price.childSeatFee": t(
    "The seat fee of the Child Seat car type; every Child Seat ride includes one seat. Other car types have no seat fee.",
    ZONE,
    `${MONEY} 0 to 500 kr. Default: 15 kr.`,
    "A Child Seat ride adds 15 kr to the price.",
  ),
  "pricing.price.minimum": t(
    "The lowest price a ride can have. A shorter ride is charged this amount.",
    ZONE,
    `${MONEY} 0 to 2 000 kr, not above the maximum fare. Default: Movera 49 kr; airport zones × 1.3.`,
    "A 1 km ride worth 41 kr is charged 49 kr.",
  ),
  "pricing.price.maximum": t(
    "The highest price a ride can have, before tips and later fees.",
    ZONE,
    `${MONEY} 0 to 50 000 kr, not below the minimum fare. Default: Movera 1 500 kr.`,
    "A long trip worth 1 800 kr is charged 1 500 kr.",
  ),
  "pricing.price.appFeePct": t(
    "Movera's app fee, added on top of the rider's price. The same value shows in Prices › Limits and on the Commission card.",
    ZONE,
    "Percent, 0 to 50, one decimal. Default: 10% (Premium 12%).",
    "A 200 kr ride with a 10% app fee: the rider pays 220 kr.",
  ),
  "pricing.commission": t(
    "Movera's share of the driver's ride price for this car type. It is used when the car type has no commission steps.",
    ZONE_DRIVER,
    "Percent, 0 to 60. Default: 20% (Premium 22%).",
    "A 200 kr ride with 20%: the driver gets 160 kr, Movera 40 kr plus the app fee.",
  ),
  "pricing.commissionSteps.upTo": t(
    "Where a commission step ends: the step applies to trip prices up to this amount (ride part and extras, without waiting). The last step is always \"Above\".",
    ZONE_DRIVER,
    "Money in the zone's currency, a whole minor unit above 0, higher than the step before. Up to 50 steps; no steps = the commission % is used.",
    "Up to 100 kr: 10%; above 100 kr: 20%.",
  ),
  "pricing.commissionSteps.kind": t(
    "Whether this step takes a percent of the trip price or a fixed amount.",
    ZONE_DRIVER,
    "Percent (%) or Fixed amount. A new step starts as a percent.",
    "Fixed amount 15 kr for trips up to 100 kr.",
  ),
  "pricing.commissionSteps.value": t(
    "Movera's commission inside this step: a percent of the trip price, or a fixed amount (capped at the ride part).",
    ZONE_DRIVER,
    "Percent 0 to 60, or a fixed amount of 0 or more in the zone's currency.",
    "Step \"above 300 kr\" at 18%: a 400 kr trip pays 72 kr commission.",
  ),
  "pricing.fee.airportPickup": t(
    "Added to the price when the ride starts at an airport.",
    ZONE,
    `${MONEY} 0 to 1 000 kr. Default: 65 kr in an airport zone, 0 elsewhere.`,
    "A ride from Arlanda adds 65 kr.",
  ),
  "pricing.fee.airportDropoff": t(
    "Added to the price when the ride ends at an airport.",
    ZONE,
    `${MONEY} 0 to 1 000 kr. Default: 30 kr in an airport zone, 0 elsewhere.`,
    "A ride to Arlanda adds 30 kr.",
  ),
  "pricing.fee.reservationFee": t(
    "Added to rides booked ahead.",
    ZONE,
    `${MONEY} 0 to 1 000 kr. Default: 25 kr.`,
    "A ride booked for tomorrow 07:00 adds 25 kr.",
  ),
  "pricing.fee.cleaningFee": t(
    "The cleaning or damage fee an admin can add after a ride, with a reason.",
    ZONE,
    `${MONEY} 0 to 2 000 kr. Default: 300 kr.`,
    "A rider spills a drink: an admin adds 300 kr with the reason.",
  ),
  "pricing.fee.tolls": t(
    "Whether road tolls on the route are added to the rider's fare.",
    ZONE,
    "Added to fare or Not added. Default: added in Sweden, not added in France and Tunisia.",
    "On: a toll on the route is added to the fare.",
  ),
  "pricing.fee.rounding": t(
    "The final price is rounded to this step.",
    ZONE,
    "Sweden: none, 1, 5 or 10 kr; France: none, 0.05, 0.10, 0.50 or 1 €; Tunisia: none, 0.1, 0.5 or 1 DT. Default: 1 kr, 0.05 € or 0.1 DT.",
    "Nearest 5 kr: 197 kr becomes 195 kr.",
  ),
  "pricing.fee.minTrip": t(
    "A drop-off closer than this to the pickup is refused. The rider sees \"Drop-off is too close to pickup\".",
    ZONE,
    "Metres, 0 to 5 000, steps of 10. 0 = off. Default: 0.",
    "300 m: a drop-off 200 m from the pickup cannot be booked.",
  ),
  "pricing.route.places": t(
    "The two places of a fixed-price route, written as the admin wants them shown.",
    "Pricing › Fees › Fixed routes, for the zone picked at the top (or the country Standard), after Publish.",
    "Free text, one name for From and one for To.",
    "From Arlanda, To City.",
  ),
  "pricing.route.category": t(
    "The car type the fixed price is for.",
    "Pricing › Fees › Fixed routes, for the zone picked at the top (or the country Standard), after Publish.",
    "One of the zone's car types.",
    "Arlanda to City in Movera XL.",
  ),
  "pricing.route.price": t(
    "One flat price for this route and car type, instead of the km and minute price.",
    "Pricing › Fees › Fixed routes, for the zone picked at the top (or the country Standard). Riders see it in the rider app after Publish.",
    `${MONEY} 0 to 20 000 kr (about 1 900 € or 6 000 DT). No routes by default.`,
    "Arlanda to City in Movera: 650 kr whatever the traffic.",
  ),
  "pricing.manualSurge.level": t(
    "A surge an admin starts by hand. It wins over smart and scheduled surge while it runs.",
    SURGE,
    "× 1.0 to × 6.0, steps of 0.1. Above × 3 the admin must confirm.",
    "× 1.5 for a concert ending: a 200 kr ride costs 300 kr.",
  ),
  "pricing.manualSurge.duration": t(
    "How long the manual surge runs. It stops by itself at the end.",
    SURGE,
    "15 min, 30 min, 1 h, 2 h, 4 h or 8 h on the Surge tab; 5 to 720 minutes, or an end time, in the map pop-up.",
    "Runs for 1 h: at 21:00 it ends and prices go back to normal.",
  ),
  "pricing.smart.on": t(
    "Turns smart surge on: the server raises prices by itself when there are many requests per free driver.",
    SURGE,
    "On or off. Default: off.",
    "On: at 3 requests per free driver the Normal profile gives × 2.0.",
  ),
  "pricing.smart.active": t(
    "The hours of the day when smart surge may run. The same time in both boxes = all day.",
    SURGE,
    "Times like 06:00. Default: 00:00 to 00:00 (all day).",
    "18:00 to 03:00: smart surge only in the evening and night.",
  ),
  "pricing.smart.checkEvery": t(
    "How often smart surge compares requests with free drivers.",
    SURGE,
    "Minutes, 1 to 15. Default: 1.",
    "Every 2 min: a busy spell is seen within 2 minutes.",
  ),
  "pricing.smart.hold": t(
    "A level must hold this long before the surge starts, so a short peak does not raise prices.",
    SURGE,
    "Minutes, 1 to 30. Default: 3.",
    "3 min: a 1 minute rush gives no surge.",
  ),
  "pricing.smart.stopAfter": t(
    "Demand must stay low this long before the surge goes down a step.",
    SURGE,
    "Minutes, 1 to 60. Default: 5.",
    "5 min: the surge only falls after 5 quiet minutes.",
  ),
  "pricing.smart.cooldown": t(
    "The shortest time between two changes of the smart surge level.",
    SURGE,
    "Minutes, 1 to 30. Default: 2.",
    "2 min: the price changes at most once every 2 minutes.",
  ),
  "pricing.smart.profileName": t(
    "The name of a time profile, shown in the admin only.",
    "Pricing › Surge › Smart surge, for the zone picked at the top (or the country Standard).",
    "Free text, not empty. Defaults: Weekend night, Rush hour, Night, Normal.",
    "Name a profile \"Friday party\".",
  ),
  "pricing.smart.profileDays": t(
    "The days this time profile is used. The first matching profile from the top wins; Normal is used the rest of the time.",
    "Pricing › Surge › Smart surge, for the zone picked at the top (or the country Standard).",
    "At least one day, Mon to Sun.",
    "Rush hour on Mon to Fri.",
  ),
  "pricing.smart.profileWindow": t(
    "The times of day this profile is used, on its days. A profile can have several windows.",
    "Pricing › Surge › Smart surge, for the zone picked at the top (or the country Standard).",
    "Times like 07:00. Rush hour default: 07:00–09:00 and 16:00–18:00.",
    "22:00 to 05:00 for a night profile.",
  ),
  "pricing.smart.stepLevel": t(
    "The busy level that starts this step: requests per free driver.",
    SURGE,
    "Above 0, up to 20, one decimal; each step higher than the one before. Up to 5 steps.",
    "1.5 means 3 requests waiting for 2 free drivers.",
  ),
  "pricing.smart.stepSurge": t(
    "The surge used when this step's level is reached.",
    SURGE,
    "× 1.0 to × 6.0, at least the surge of the step before and not above the cap.",
    "Level 2 → × 1.5: a 200 kr ride costs 300 kr.",
  ),
  "pricing.smart.cap": t(
    "The highest surge this profile can ever give.",
    SURGE,
    "× 1.0 to × 6.0. Defaults: Weekend night × 3, Rush hour × 2.5, Night × 2, Normal × 2.5.",
    "Cap × 2: even a very busy night never goes above × 2.",
  ),
  "pricing.scheduled.name": t(
    "The name of a planned surge, for an event or a holiday.",
    "Pricing › Surge › Scheduled surges, for the zone picked at the top (or the country Standard).",
    "Free text. No scheduled surges by default.",
    "Concert at the arena.",
  ),
  "pricing.scheduled.times": t(
    "When the planned surge starts and ends, in the zone's local time.",
    SURGE,
    "Date and time; the end must be after the start.",
    "Saturday 22:30 to Sunday 01:00.",
  ),
  "pricing.scheduled.level": t(
    "The surge used between the start and the end.",
    SURGE,
    "× 1.0 to × 6.0.",
    "× 1.8 during the concert exit.",
  ),
  "pricing.pickup.on": t(
    "Whether Movera pays drivers of this car type for the drive to the pickup. Worked out from the driver's live location when an offer shows.",
    "Pricing › Pickup pay, for the zone picked at the top (or the country Standard). Drivers see only the total in the driver app.",
    "On or off. Default: on for the built-in car types.",
    "On: a driver 4 km away sees the trip pay plus the pickup pay.",
  ),
  "pricing.pickup.max": t(
    "The most pickup pay one ride can give a driver of this car type.",
    "Pricing › Pickup pay, for the zone picked at the top (or the country Standard), after Publish.",
    "Off (no maximum) or an amount in the zone's currency. Default: off; turning it on starts at 100 kr.",
    "Maximum 60 kr: a far pickup worth 90 kr pays 60 kr.",
  ),
  "pricing.pickup.ranges": t(
    "Driver pickup pay by distance: every km is paid at the rate of the range it falls in, and the minutes are split across the ranges by km. A range at 0 is free.",
    "Pricing › Pickup pay, per car type, for the zone picked at the top (or the country Standard), after Publish.",
    "km with one decimal; money per km and per minute in the zone's currency. Default: first km free, then Movera 2.50 kr per km and 0.80 kr per minute.",
    "3 km and 6 minutes away: 2 km × 2.50 kr + 4 min × 0.80 kr = 8.20 kr.",
  ),
  "pricing.pickup.riderFee": t(
    "A fixed pickup fee in the rider's price, with no ranges: one for live rides (Radar and Exclusive), one for reservations. Off = the rider pays nothing for the pickup.",
    "Pricing › Pickup pay, per car type, for the zone picked at the top (or the country Standard). Riders see it in the price after Publish.",
    "On or off plus an amount in the zone's currency. Default: off; 15 kr for live rides, 20 kr for reservations.",
    "On for reservations at 20 kr: a booked ride costs 20 kr more.",
  ),
  "pricing.pickup.offer.radar": t(
    "Whether Radar trips get pickup pay. Each driver who sees the card gets his own amount, from where he is.",
    "Pricing › Pickup pay, for the zone picked at the top (or the country Standard). Drivers see it in the driver app.",
    "On or off. Default: on.",
    "On: two drivers see the same Radar trip with different totals.",
  ),
  "pricing.pickup.offer.exclusive": t(
    "Whether Exclusive offers get pickup pay, for the one driver who gets the offer.",
    "Pricing › Pickup pay, for the zone picked at the top (or the country Standard). Drivers see it in the driver app.",
    "On or off. Default: on.",
    "Off: an Exclusive offer shows only the trip pay.",
  ),
  "pricing.pickup.offer.exclusiveReservation": t(
    "Whether reservations offered as Exclusive, or in Radar near pickup time, get pickup pay.",
    "Pricing › Pickup pay, for the zone picked at the top (or the country Standard). Drivers see it in the driver app.",
    "On or off. Default: on.",
    "On: a reservation sent as Exclusive 20 min before pickup adds pickup pay.",
  ),
  "pricing.pickup.offer.assigned": t(
    "Whether rides an admin gives to a driver get pickup pay.",
    "Pricing › Pickup pay, for the zone picked at the top (or the country Standard). Drivers see it in the driver app.",
    "On or off. Default: on.",
    "On: a ride assigned from Dispatch pays the drive to the pickup.",
  ),
  "pricing.pickup.offer.nextTrip": t(
    "Whether a next trip while driving gets pickup pay, worked out from the current drop-off to the next pickup.",
    "Pricing › Pickup pay, for the zone picked at the top (or the country Standard). Drivers see it in the driver app.",
    "On or off. Default: on.",
    "On: drop-off to the next pickup is 2 km, so pickup pay is for those 2 km.",
  ),
  "pricing.pickup.scheduledNever": t(
    "Normal reservations a driver takes from the Scheduled rides list never get driver pickup pay. This cannot be changed.",
    "Every zone. The rider's reservation pickup fee, when on, is paid either way.",
    "Always off.",
    "A driver takes tomorrow's ride from Scheduled rides: no pickup pay.",
  ),
  "pricing.category.name": t(
    "The car type's name that riders see when they choose a ride.",
    "Pricing › Car types: one list for every zone. A new type starts off in every zone, with Movera's prices to edit.",
    "Free text, not empty.",
    "Women Driver.",
  ),
  "pricing.category.line": t(
    "The short line under the car type's name, in Swedish, French and English. The rider app shows the one in the rider's language.",
    "Pricing › Car types: one list for every zone; the rider app.",
    "Up to 80 characters per language.",
    "Movera XL: \"Up to 6 seats\".",
  ),
  "pricing.category.seats": t(
    "How many riders the car type takes.",
    "Pricing › Car types: one list for every zone.",
    "1 to 8. Built-in types: 4, Movera XL 6.",
    "A van type with 8 seats.",
  ),
};
