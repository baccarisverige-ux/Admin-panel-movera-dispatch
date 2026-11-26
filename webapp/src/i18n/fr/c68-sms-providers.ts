/** French dictionary, area c68-sms-providers: SMS company order, Infobip first and 46elks as backup (contract v0.18.168 contract.json#smsProviders; owner 2026-11-26 "Infobip + 46elks en secours (Recommandé)"). Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC68SmsProviders } from "../en/c68-sms-providers.ts";

export const frC68SmsProviders: Record<keyof typeof enC68SmsProviders, string> = {
  "SMS company order": "Ordre des sociétés SMS",
  "{0} only": "{0} seulement",
  "{0}, then {1} (backup)": "{0}, puis {1} (secours)",
  "SMS company order: {0} → {1}": "Ordre des sociétés SMS : {0} → {1}",
};
