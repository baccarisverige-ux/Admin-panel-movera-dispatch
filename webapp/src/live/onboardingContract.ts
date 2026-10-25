/**
 * contract.json#driverOnboarding (v0.5.3): the document types with their names in en / sv / fr, the lists required per
 * country, and the cities. A copy, like CONFIG_DEFAULTS: src/live/format.test.ts checks it equals the synced contract.
 */

export type DocumentTypeInfo = { owner: "driver" | "vehicle"; kind: "file" | "acceptance" | "admin_check"; name: { en: string; sv: string; fr: string } };

export const DOCUMENT_TYPES: Readonly<Record<string, DocumentTypeInfo>> = {
  terms: { owner: "driver", kind: "acceptance", name: { en: "Terms and conditions", sv: "Villkor", fr: "Conditions générales" } },
  info_session: { owner: "driver", kind: "admin_check", name: { en: "Virtual information session", sv: "Digitalt informationsmöte", fr: "Session d’information en ligne" } },
  driving_license: { owner: "driver", kind: "file", name: { en: "Driving licence", sv: "Körkort", fr: "Permis de conduire" } },
  profile_photo: { owner: "driver", kind: "file", name: { en: "Profile photo", sv: "Profilbild", fr: "Photo de profil" } },
  national_id: { owner: "driver", kind: "file", name: { en: "ID card or passport", sv: "ID-kort eller pass", fr: "Pièce d’identité ou passeport" } },
  taxi_driver_license: { owner: "driver", kind: "file", name: { en: "Taxi driver licence", sv: "Taxiförarlegitimation", fr: "Carte de chauffeur de taxi" } },
  vtc_card: { owner: "driver", kind: "file", name: { en: "VTC professional card", sv: "VTC-yrkeskort", fr: "Carte professionnelle VTC" } },
  company_registration: { owner: "driver", kind: "file", name: { en: "Company registration", sv: "Registreringsbevis (Bolagsverket)", fr: "Extrait Kbis ou avis SIRENE (moins de 3 mois)" } },
  taxi_traffic_permit: { owner: "driver", kind: "file", name: { en: "Taxi traffic permit", sv: "Taxitrafiktillstånd (Transportstyrelsen)", fr: "Licence de taxi" } },
  tax_settings: { owner: "driver", kind: "file", name: { en: "Tax settings (F-skatt)", sv: "F-skattsedel", fr: "Attestation fiscale" } },
  bank_statement: { owner: "driver", kind: "file", name: { en: "Bank details", sv: "Kontobevis", fr: "RIB de la société" } },
  vtc_register_certificate: { owner: "driver", kind: "file", name: { en: "VTC operators register certificate", sv: "Intyg från VTC-registret", fr: "Certificat d’inscription au registre des exploitants VTC" } },
  rc_pro_insurance: { owner: "driver", kind: "file", name: { en: "Professional liability insurance (RC pro)", sv: "Ansvarsförsäkring (RC pro)", fr: "Attestation RC professionnelle" } },
  urssaf_certificate: { owner: "driver", kind: "file", name: { en: "URSSAF certificate", sv: "URSSAF-intyg", fr: "Attestation de vigilance URSSAF" } },
  vehicle_registration: { owner: "vehicle", kind: "file", name: { en: "Registration certificate", sv: "Registreringsbevis", fr: "Certificat d’immatriculation (carte grise)" } },
  insurance: { owner: "vehicle", kind: "file", name: { en: "Vehicle insurance", sv: "Försäkringsbrev", fr: "Assurance transport de personnes" } },
  vtc_sticker: { owner: "vehicle", kind: "file", name: { en: "VTC sticker (macaron)", sv: "VTC-dekal", fr: "Macaron VTC" } },
};

export type RequiredDocuments = { driver: readonly string[]; fleet: readonly string[]; vehicle: readonly string[] };

export const REQUIRED_DOCUMENTS: Readonly<Record<string, RequiredDocuments>> = {
  SE: { driver: ["terms", "info_session", "driving_license", "profile_photo", "taxi_driver_license"], fleet: ["company_registration", "taxi_traffic_permit", "tax_settings", "bank_statement"], vehicle: ["vehicle_registration", "insurance"] },
  FR: { driver: ["terms", "vtc_card", "driving_license", "national_id", "profile_photo"], fleet: ["company_registration", "vtc_register_certificate", "rc_pro_insurance", "urssaf_certificate", "national_id", "bank_statement"], vehicle: ["vehicle_registration", "insurance", "vtc_sticker"] },
};

export type OnboardingCity = { cityId: string; name: string; zoneId: string };

export const ONBOARDING_COUNTRIES: Readonly<Record<string, { open: boolean; cities: readonly OnboardingCity[] }>> = {
  SE: { open: true, cities: [{ cityId: "stockholm_lan", name: "Stockholm län", zoneId: "Z001" }] },
  FR: { open: true, cities: [{ cityId: "paris", name: "Paris", zoneId: "FR-PC" }] },
  TN: { open: false, cities: [] },
};

export const FLEET_CODE = { prefix: "MV-", length: 5, alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" } as const;
