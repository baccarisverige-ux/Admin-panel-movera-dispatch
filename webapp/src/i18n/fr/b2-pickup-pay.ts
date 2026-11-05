/** French dictionary, area b2-pickup-pay: Section “Pickup pay” in the old file. Merged in ../fr.ts in this order. */
import type { enB2PickupPay } from "../en/b2-pickup-pay.ts";

export const frB2PickupPay: Record<keyof typeof enB2PickupPay, string> = {
  // Pickup pay
  "A category keeps at least one range.": "Une catégorie garde au moins une tranche.",
  "{0} A farther range pays less per km than the one before it. Allowed, but check it is what you want.": "{0} Une tranche plus lointaine paie moins par km que la précédente. C’est permis, mais vérifiez que c’est voulu.",
  "Two separate sides. The driver gets pickup pay from Movera for the drive to the pickup, worked out from their live location each time an offer shows; the driver only sees the total. The rider pays a fixed pickup fee set here, the same whoever the driver is. Movera keeps the difference, and covers it when the driver came from far.": "Deux côtés séparés. Le chauffeur reçoit de Movera une prime d’approche pour le trajet jusqu’à la prise en charge, calculée depuis sa position en direct à chaque offre ; il ne voit que le total. Le passager paie des frais d’approche fixes réglés ici, les mêmes quel que soit le chauffeur. Movera garde la différence et la couvre quand le chauffeur vient de loin.",
  "Paid by Movera": "Payée par Movera",
  "{0} maximum per ride": "{0} maximum par course",
  "Maximum per ride": "Maximum par course",
  "{0} maximum pickup pay per ride": "{0} prime d’approche maximale par course",
  "No maximum": "Sans maximum",
  "{0} rider pickup fee": "{0} frais d’approche passager",
  "Live rides (Radar & Exclusive)": "Courses immédiates (Radar et Exclusif)",
  "{0} rider pickup fee for {1}": "{0} frais d’approche passager pour {1}",
  "{0} rider pickup fee amount for {1}": "{0} montant des frais d’approche passager pour {1}",
  "Driver side: every km is paid at the rate of the range it falls in, and the minutes are split across the ranges in proportion to the km in each. Set a range to 0 to make it free. Ranges go up with no gaps; only the last can be \"and above\". The maximum per ride caps what all the ranges add up to.": "Côté chauffeur : chaque km est payé au tarif de la tranche où il tombe, et les minutes sont réparties entre les tranches au prorata des km de chacune. Mettez une tranche à 0 pour la rendre gratuite. Les tranches se suivent sans trou ; seule la dernière peut être « et au-delà ». Le maximum par course plafonne la somme de toutes les tranches.",
  "Rider side: a fixed amount in the price, with no ranges. One for live rides (Radar and Exclusive) and one for reservations; when it is off the rider pays nothing for the pickup.": "Côté passager : un montant fixe dans le prix, sans tranches. Un pour les courses immédiates (Radar et Exclusif) et un pour les réservations ; désactivé, le passager ne paie rien pour l’approche.",
  "{0} Reservations taken from the Scheduled rides list never get driver pickup pay. The rider's reservation pickup fee, when on, is paid either way.": "{0} Les réservations prises dans la liste Courses programmées ne donnent jamais de prime d’approche au chauffeur. Les frais d’approche passager pour réservation, s’ils sont activés, sont payés dans tous les cas.",
  "Example ride kind": "Type de course de l’exemple",
  "Live ride": "Course immédiate",
  "Driver pickup pay · paid by Movera": "Prime d’approche chauffeur · payée par Movera",
  "{0}: {1} km × {2} + {3} min × {4}": "{0} : {1} km × {2} + {3} min × {4}",
  "Ranges add up to {0}; capped at the maximum": "Les tranches totalisent {0} ; plafonné au maximum",
  "The maximum of {0} is not reached within 300 km at this pace.": "Le maximum de {0} n’est pas atteint en 300 km à ce rythme.",
  "From about {0} km the maximum of {1} applies.": "À partir d’environ {0} km, le maximum de {1} s’applique.",
  "of which fixed pickup fee": "dont frais d’approche fixes",
  "Fixed pickup fee (off)": "Frais d’approche fixes (désactivés)",
  "Movera covers": "Movera couvre",
  "Movera's share before pickup pay is {0}. It gains when the driver is close and covers the difference when the driver came from far.": "La part de Movera avant la prime d’approche est de {0}. Elle gagne quand le chauffeur est proche et couvre la différence quand il vient de loin.",
};
