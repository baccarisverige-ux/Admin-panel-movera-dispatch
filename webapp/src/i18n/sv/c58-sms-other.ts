/** Swedish dictionary, area c58-sms-other: SMS sign-in for numbers from other countries (contract v0.18.157 contract.json#smsSignIn.otherCountries, owner 2026-11-24). Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC58SmsOther } from "../en/c58-sms-other.ts";

export const svC58SmsOther: Record<keyof typeof enC58SmsOther, string> = {
  "SMS sign-in for numbers from other countries": "Sms-inloggning för nummer från andra länder",
  "{0} SMS sign-in for numbers from other countries": "{0} Sms-inloggning för nummer från andra länder",
  "Send sign-in codes to rider numbers from all other countries": "Skicka inloggningskoder till resenärsnummer från alla andra länder",
  "Daily limit (SMS per 24 hours, all other countries together)": "Dagsgräns (sms per 24 timmar, alla andra länder tillsammans)",
  "For visitors with a foreign number (for example Tunisian, German or US). Each code is an international SMS and costs more than a Swedish one. Foreign numbers are the usual target of SMS fraud, so keep the limit low and raise it only when real visitors need it. At the limit, new codes for these numbers stop until the next day. Sweden keeps its own switch and limit.": "För besökare med utländskt nummer (till exempel tunisiskt, tyskt eller amerikanskt). Varje kod är ett utlandssms och kostar mer än ett svenskt. Utländska nummer är vanliga mål för sms-bedrägerier, så håll gränsen låg och höj den bara när riktiga besökare behöver det. Vid gränsen stoppas nya koder till dessa nummer till nästa dag. Sverige har kvar sin egen brytare och gräns.",
  "Other countries sign-in SMS per day: a whole number from {0} to {1}.": "Inloggnings-sms per dag för andra länder: ett heltal från {0} till {1}.",
  "SMS sign-in for other countries: {0} → {1}": "Sms-inloggning för andra länder: {0} → {1}",
  "Other countries sign-in SMS per day: {0} → {1}": "Inloggnings-sms per dag för andra länder: {0} → {1}",
  "Sign-in SMS to other countries: {0} of {1} sent in the last 24 hours": "Inloggnings-sms till andra länder: {0} av {1} skickade de senaste 24 timmarna",
  "Sign-in SMS limit for other countries reached: {0} of {1} in the last 24 hours. New sign-in codes for these numbers are stopped": "Gränsen för inloggnings-sms till andra länder är nådd: {0} av {1} de senaste 24 timmarna. Nya inloggningskoder till dessa nummer är stoppade",
  "Raise the daily limit for other countries in Tips & limits (Sweden) if these are real people": "Höj dagsgränsen för andra länder i Dricks och gränser (Sverige) om det är riktiga personer",
  "Per calling code (SMS per 24 hours)": "Per landsnummer (sms per 24 timmar)",
  "All sign-in SMS per minute, at most": "Alla inloggnings-sms per minut, högst",
  "Blocked calling codes (for example +882)": "Blockerade landsnummer (till exempel +882)",
  "SMS per calling code per day: a whole number from {0} to {1}.": "Sms per landsnummer och dag: ett heltal från {0} till {1}.",
  "Sign-in SMS per minute: a whole number from {0} to {1}.": "Inloggnings-sms per minut: ett heltal från {0} till {1}.",
  "Blocked calling codes: up to 50 codes like +882, each once.": "Blockerade landsnummer: upp till 50 nummer som +882, vart och ett en gång.",
  "SMS per calling code per day: {0} → {1}": "Sms per landsnummer och dag: {0} → {1}",
  "Sign-in SMS per minute: {0} → {1}": "Inloggnings-sms per minut: {0} → {1}",
  "Blocked calling codes: {0} → {1}": "Blockerade landsnummer: {0} → {1}",
  "Sign-in SMS spike to {0}: {1} of {2} in the last 24 hours. New codes for this calling code are stopped": "Topp av inloggnings-sms till {0}: {1} av {2} de senaste 24 timmarna. Nya koder till detta landsnummer är stoppade",
  "Sign-in SMS burst: the limit of {0} per minute was reached. New codes wait": "Rusning av inloggnings-sms: gränsen {0} per minut är nådd. Nya koder får vänta",
  "Check for SMS pumping; block the calling code in Tips & limits (Sweden) if these are not real people": "Kontrollera om det är sms-bedrägeri; blockera landsnumret i Dricks och gränser (Sverige) om det inte är riktiga personer",
};
