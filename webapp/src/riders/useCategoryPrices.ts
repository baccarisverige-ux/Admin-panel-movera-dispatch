import { useMemo } from "react";
import { useSlice } from "../api/hooks";
import { market, type MarketId } from "../markets/markets";
import { SLICE_KEY, activeCategories, emptyPricingStore, normalizeStore, quoteRide, zoneBook } from "../pricing/zonePricing";

export type CategoryPrice = { id: string; label: string; line: string; seats: number; price: number };

/** Each category's price for a sample 8 km, 18 min ride in the country's first zone, from the published price list. */
export function useCategoryPrices(country: MarketId, zoneId?: string): { zoneName: string; rows: CategoryPrice[] } {
  const slice = useSlice<unknown>(SLICE_KEY, emptyPricingStore());
  return useMemo(() => {
    const store = normalizeStore(slice.value);
    const zone = market(country).zones.find((item) => item.id === zoneId) ?? market(country).zones.find((item) => item.kind === "operating") ?? market(country).zones[0];
    const book = zoneBook(store, zone.id);
    const rows = activeCategories(store)
      .filter((category) => book.prices[category.id]?.enabled)
      .map((category) => ({
        id: category.id,
        label: category.label,
        line: category.line,
        seats: category.seats,
        price: quoteRide(book, { categoryId: category.id, km: 8, minutes: 18, waitMin: 0, stops: 0, stopWaitMin: 0, airportPickup: false, airportDropoff: false, reservation: false, surge: 1 }).total,
      }));
    return { zoneName: zone.name, rows };
  }, [slice.value, country, zoneId]);
}
