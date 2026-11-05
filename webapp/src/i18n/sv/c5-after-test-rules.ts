/** Swedish dictionary, area c5-after-test-rules: Fix job 5 after-test rules: early end BOTH, booked cancel fee, booked ride next, wallet first (contract v0.18.33) (add new keys at the end of this file). Merged in ../sv.ts in this order. */
export const svC5AfterTestRules = {
  "New price only when BOTH shorter by more than (km)": "Nytt pris bara när BÅDE kortare med mer än (km)",
  "… and shorter by more than (minutes)": "… och kortare med mer än (minuter)",
  "Default 10 minutes. Both must be passed for a new price.": "Standard 10 minuter. Båda måste passeras för ett nytt pris.",
  "Cancel under (min) costs the fee, even before a driver takes it. Movera keeps the fee when no driver has taken the ride yet.": "Avbokning under (min) kostar avgiften, även innan en förare tagit resan. Movera behåller avgiften när ingen förare har tagit resan än.",
  "Booked ride for a driver on a trip": "Bokad resa till en förare som kör en resa",
  "A driver on a trip gets only Exclusive offers. A booked ride can come to him as Exclusive when he can finish his trip and reach the pickup in time.": "En förare som kör en resa får bara Exklusiva erbjudanden. En bokad resa kan komma till honom som Exklusiv när han hinner avsluta resan och nå upphämtningen i tid.",
  "Driver on a trip can get a booked ride starting within (min)": "Förare som kör en resa kan få en bokad resa som börjar inom (min)",
  "Use wallet first": "Använd plånboken först",
  "the rider can switch it off per ride": "resenären kan stänga av det per resa",
} as const;
