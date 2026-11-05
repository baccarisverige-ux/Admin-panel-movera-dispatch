/** French dictionary, area c5-after-test-rules: Fix job 5 after-test rules: early end BOTH, booked cancel fee, booked ride next, wallet first (contract v0.18.33) (add new keys at the end of this file). Merged in ../fr.ts in this order. */
export const frC5AfterTestRules = {
  "New price only when BOTH shorter by more than (km)": "Nouveau prix seulement si à la fois plus court de plus de (km)",
  "… and shorter by more than (minutes)": "… et plus court de plus de (minutes)",
  "Default 10 minutes. Both must be passed for a new price.": "Par défaut 10 minutes. Les deux doivent être dépassés pour un nouveau prix.",
  "Cancel under (min) costs the fee, even before a driver takes it. Movera keeps the fee when no driver has taken the ride yet.": "Annuler sous (min) coûte les frais, même avant qu'un chauffeur la prenne. Movera garde les frais quand aucun chauffeur n'a encore pris la course.",
  "Booked ride for a driver on a trip": "Course réservée pour un chauffeur en course",
  "A driver on a trip gets only Exclusive offers. A booked ride can come to him as Exclusive when he can finish his trip and reach the pickup in time.": "Un chauffeur en course ne reçoit que des offres Exclusives. Une course réservée peut lui arriver en Exclusive s'il peut finir sa course et atteindre la prise en charge à temps.",
  "Driver on a trip can get a booked ride starting within (min)": "Un chauffeur en course peut recevoir une course réservée qui commence dans (min)",
  "Use wallet first": "Utiliser le portefeuille d'abord",
  "the rider can switch it off per ride": "le passager peut le désactiver par course",
} as const;
