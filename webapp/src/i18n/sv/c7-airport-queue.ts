/** Swedish dictionary, area c7-airport-queue: fix job 9 airport queue (contract v0.18.39 §63) (add new keys at the end of this file). Merged in ../sv.ts in this order. */
import type { enC7AirportQueue } from "../en/c7-airport-queue.ts";

export const svC7AirportQueue: Record<keyof typeof enC7AirportQueue, string> = {
  "Airport queue area": "Kö-område på flygplatsen",
  "Drivers inside this area wait in line. The first in line gets the airport trips first.": "Förare i det här området står i kö. Den som står först får flygplatsresorna först.",
  "Could not load the queue area.": "Kunde inte ladda kö-området.",
  "Airport queue on": "Flygplatskö på",
  "Off until the area is drawn and saved.": "Av tills området är ritat och sparat.",
  "Queue area": "Kö-område",
  "Queue area: {0} points": "Kö-område: {0} punkter",
  "No queue area drawn yet.": "Inget kö-område ritat än.",
  "Use the airport outline": "Använd flygplatsens kontur",
  "Leave the queue after (outside the area)": "Lämnar kön efter (utanför området)",
  "Time to answer a queue offer": "Tid att svara på ett kö-erbjudande",
  "Queue offers before the nearest driver": "Kö-erbjudanden före närmaste förare",
  "A driver who declines keeps his place": "En förare som tackar nej behåller sin plats",
  "Off: he goes to the back of the queue.": "Av: han hamnar sist i kön.",
  "Save queue area": "Spara kö-område",
};
