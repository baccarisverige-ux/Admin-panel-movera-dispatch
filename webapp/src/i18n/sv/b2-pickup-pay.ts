/** Swedish dictionary, area b2-pickup-pay: Section “Pickup pay” in the old file. Merged in ../sv.ts in this order. */
import type { enB2PickupPay } from "../en/b2-pickup-pay.ts";

export const svB2PickupPay: Record<keyof typeof enB2PickupPay, string> = {
  // Pickup pay
  "A category keeps at least one range.": "En kategori behåller minst ett intervall.",
  "{0} A farther range pays less per km than the one before it. Allowed, but check it is what you want.": "{0} Ett längre bort liggande intervall betalar mindre per km än det före. Tillåtet, men kontrollera att det är vad du vill.",
  "Two separate sides. The driver gets pickup pay from Movera for the drive to the pickup, worked out from their live location each time an offer shows; the driver only sees the total. The rider pays a fixed pickup fee set here, the same whoever the driver is. Movera keeps the difference, and covers it when the driver came from far.": "Två skilda sidor. Föraren får upphämtningsersättning från Movera för körningen till upphämtningen, beräknad från förarens liveposition varje gång ett erbjudande visas; föraren ser bara totalen. Resenären betalar en fast upphämtningsavgift som ställs in här, densamma oavsett förare. Movera behåller mellanskillnaden och täcker den när föraren kom långt ifrån.",
  "Paid by Movera": "Betalas av Movera",
  "{0} maximum per ride": "{0} maximum per resa",
  "Maximum per ride": "Maximum per resa",
  "{0} maximum pickup pay per ride": "{0} högsta upphämtningsersättning per resa",
  "No maximum": "Inget maximum",
  "{0} rider pickup fee": "{0} upphämtningsavgift för resenär",
  "Live rides (Radar & Exclusive)": "Direktresor (Radar och Exklusiv)",
  "{0} rider pickup fee for {1}": "{0} upphämtningsavgift för resenär, {1}",
  "{0} rider pickup fee amount for {1}": "{0} belopp för resenärens upphämtningsavgift, {1}",
  "Driver side: every km is paid at the rate of the range it falls in, and the minutes are split across the ranges in proportion to the km in each. Set a range to 0 to make it free. Ranges go up with no gaps; only the last can be \"and above\". The maximum per ride caps what all the ranges add up to.": "Förarsidan: varje km betalas med taxan för det intervall den faller i, och minuterna fördelas mellan intervallen i proportion till km i varje. Sätt ett intervall till 0 för att göra det gratis. Intervallen följer på varandra utan luckor; bara det sista kan vara ”och uppåt”. Maximum per resa begränsar vad alla intervall tillsammans ger.",
  "Rider side: a fixed amount in the price, with no ranges. One for live rides (Radar and Exclusive) and one for reservations; when it is off the rider pays nothing for the pickup.": "Resenärssidan: ett fast belopp i priset, utan intervall. Ett för direktresor (Radar och Exklusiv) och ett för bokningar; när det är av betalar resenären inget för upphämtningen.",
  "{0} Reservations taken from the Scheduled rides list never get driver pickup pay. The rider's reservation pickup fee, when on, is paid either way.": "{0} Bokningar som tas från listan Schemalagda resor ger aldrig föraren upphämtningsersättning. Resenärens upphämtningsavgift för bokningar betalas ändå när den är på.",
  "Example ride kind": "Resetyp i exemplet",
  "Live ride": "Direktresa",
  "Driver pickup pay · paid by Movera": "Förarens upphämtningsersättning · betalas av Movera",
  "{0}: {1} km × {2} + {3} min × {4}": "{0}: {1} km × {2} + {3} min × {4}",
  "Ranges add up to {0}; capped at the maximum": "Intervallen ger {0}; begränsat till maximum",
  "The maximum of {0} is not reached within 300 km at this pace.": "Maximum på {0} nås inte inom 300 km i den här takten.",
  "From about {0} km the maximum of {1} applies.": "Från ungefär {0} km gäller maximum på {1}.",
  "of which fixed pickup fee": "varav fast upphämtningsavgift",
  "Fixed pickup fee (off)": "Fast upphämtningsavgift (av)",
  "Movera covers": "Movera täcker",
  "Movera's share before pickup pay is {0}. It gains when the driver is close and covers the difference when the driver came from far.": "Moveras andel före upphämtningsersättning är {0}. Movera tjänar när föraren är nära och täcker mellanskillnaden när föraren kom långt ifrån.",
};
