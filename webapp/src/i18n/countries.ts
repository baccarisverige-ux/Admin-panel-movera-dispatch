import type { MarketId } from "../markets/markets.ts";

/** Country names as the panel shows them; translated where shown (trx). The market records keep the English name. */
export const COUNTRY_LABEL: Record<MarketId, string> = { SE: "Sweden", FR: "France", TN: "Tunisia" };
