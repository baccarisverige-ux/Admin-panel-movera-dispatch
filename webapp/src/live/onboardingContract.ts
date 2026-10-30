/**
 * contract.json#driverOnboarding (v0.5.3): the document types with their names in en / sv / fr, the lists required per
 * country, and the cities. A copy, like CONFIG_DEFAULTS: src/live/format.test.ts checks it equals the synced contract.
 */

export type DocumentTypeInfo = { owner: "driver" | "vehicle"; kind: "file" | "acceptance" | "admin_check"; name: { en: string; sv: string; fr: string };
  /** v0.18.3 (R5): the name in a country (SE, FR); the admin's settings.texts[type].name still wins. */
  nameByCountry?: Readonly<Record<string, { en: string; sv: string; fr: string }>>;
};

export const DOCUMENT_TYPES: Readonly<Record<string, DocumentTypeInfo>> = {
  terms: { owner: "driver", kind: "acceptance", name: { en: "Terms and conditions", sv: "Villkor", fr: "Conditions générales" } },
  info_session: { owner: "driver", kind: "admin_check", name: { en: "Virtual information session", sv: "Digitalt informationsmöte", fr: "Session d’information en ligne" } },
  driving_license: { owner: "driver", kind: "file", name: { en: "Driving licence", sv: "Körkort", fr: "Permis de conduire" } },
  profile_photo: { owner: "driver", kind: "file", name: { en: "Profile photo", sv: "Profilbild", fr: "Photo de profil" } },
  national_id: { owner: "driver", kind: "file", name: { en: "ID card or passport", sv: "ID-kort eller pass", fr: "Pièce d’identité ou passeport" } },
  taxi_driver_license: { owner: "driver", kind: "file", name: { en: "Taxi driver licence", sv: "Taxiförarlegitimation", fr: "Carte de chauffeur de taxi" }, nameByCountry: { SE: { en: "Taxi driver licence (Transportstyrelsen)", sv: "Taxiförarlegitimation", fr: "Carte de conducteur de taxi (Transportstyrelsen)" } } },
  vtc_card: { owner: "driver", kind: "file", name: { en: "VTC professional card", sv: "VTC-yrkeskort", fr: "Carte professionnelle VTC" } },
  company_registration: { owner: "driver", kind: "file", name: { en: "Company registration", sv: "Registreringsbevis (Bolagsverket)", fr: "Extrait Kbis ou avis SIRENE (moins de 3 mois)" }, nameByCountry: { SE: { en: "Company registration certificate (Bolagsverket)", sv: "Registreringsbevis (Bolagsverket)", fr: "Certificat d’enregistrement de la société (Bolagsverket)" }, FR: { en: "Kbis extract or SIRENE notice (under 3 months)", sv: "Kbis-utdrag eller SIRENE-intyg (högst 3 månader)", fr: "Extrait Kbis ou avis SIRENE (moins de 3 mois)" } } },
  taxi_traffic_permit: { owner: "driver", kind: "file", name: { en: "Taxi traffic permit", sv: "Taxitrafiktillstånd (Transportstyrelsen)", fr: "Licence de taxi" }, nameByCountry: { SE: { en: "Taxi traffic permit (Transportstyrelsen)", sv: "Taxitrafiktillstånd (Transportstyrelsen)", fr: "Autorisation de trafic taxi (Transportstyrelsen)" } } },
  tax_settings: { owner: "driver", kind: "file", name: { en: "Tax settings (F-skatt)", sv: "F-skattsedel", fr: "Attestation fiscale" }, nameByCountry: { SE: { en: "F-tax certificate (Skatteverket)", sv: "F-skattsedel", fr: "Attestation F-skatt (Skatteverket)" } } },
  bank_statement: { owner: "driver", kind: "file", name: { en: "Bank details", sv: "Kontobevis", fr: "RIB de la société" }, nameByCountry: { SE: { en: "Company bank account statement", sv: "Kontobevis", fr: "Relevé bancaire de l’entreprise" }, FR: { en: "Company bank details (RIB)", sv: "Företagets bankuppgifter (RIB)", fr: "RIB de la société" } } },
  vtc_register_certificate: { owner: "driver", kind: "file", name: { en: "VTC operators register certificate", sv: "Intyg från VTC-registret", fr: "Certificat d’inscription au registre des exploitants VTC" } },
  rc_pro_insurance: { owner: "driver", kind: "file", name: { en: "Professional liability insurance (RC pro)", sv: "Ansvarsförsäkring (RC pro)", fr: "Attestation RC professionnelle" } },
  urssaf_certificate: { owner: "driver", kind: "file", name: { en: "URSSAF certificate", sv: "URSSAF-intyg", fr: "Attestation de vigilance URSSAF" } },
  vehicle_registration: { owner: "vehicle", kind: "file", name: { en: "Registration certificate", sv: "Registreringsbevis", fr: "Certificat d’immatriculation (carte grise)" }, nameByCountry: { SE: { en: "Registration certificate (Transportstyrelsen)", sv: "Registreringsbevis", fr: "Certificat d’immatriculation (Transportstyrelsen)" }, FR: { en: "Registration certificate (carte grise)", sv: "Registreringsbevis (carte grise)", fr: "Certificat d’immatriculation (carte grise)" } } },
  insurance: { owner: "vehicle", kind: "file", name: { en: "Vehicle insurance", sv: "Försäkringsbrev", fr: "Assurance transport de personnes" }, nameByCountry: { SE: { en: "Vehicle insurance (taxi)", sv: "Försäkringsbrev", fr: "Assurance du véhicule (taxi)" }, FR: { en: "Passenger transport insurance", sv: "Försäkring för persontransport", fr: "Assurance transport de personnes" } } },
  vtc_sticker: { owner: "vehicle", kind: "file", name: { en: "VTC sticker (macaron)", sv: "VTC-dekal", fr: "Macaron VTC" } },
  vehicle_photo_front: { owner: "vehicle", kind: "file", name: { en: "Photo: front with plate", sv: "Foto: framifrån med registreringsskylt", fr: "Photo : avant avec plaque" } },
  vehicle_photo_back: { owner: "vehicle", kind: "file", name: { en: "Photo: back with plate", sv: "Foto: bakifrån med registreringsskylt", fr: "Photo : arrière avec plaque" } },
  vehicle_photo_side: { owner: "vehicle", kind: "file", name: { en: "Photo: side", sv: "Foto: från sidan", fr: "Photo : côté" } },
  vehicle_photo_inside: { owner: "vehicle", kind: "file", name: { en: "Photo: inside", sv: "Foto: insidan", fr: "Photo : intérieur" } },
};

export type RequiredDocuments = { driver: readonly string[]; fleet: readonly string[]; vehicle: readonly string[] };

export const REQUIRED_DOCUMENTS: Readonly<Record<string, RequiredDocuments>> = {
  SE: { driver: ["terms", "info_session", "driving_license", "profile_photo", "taxi_driver_license"], fleet: ["company_registration", "taxi_traffic_permit", "tax_settings", "bank_statement"], vehicle: ["vehicle_registration", "insurance"] },
  FR: { driver: ["terms",  "info_session",  "vtc_card",  "driving_license",  "national_id",  "profile_photo"], fleet: ["company_registration", "vtc_register_certificate", "rc_pro_insurance", "urssaf_certificate", "national_id", "bank_statement"], vehicle: ["vehicle_registration", "insurance", "vtc_sticker"] },
};

export type OnboardingCity = { cityId: string; name: string; zoneId: string };

export const ONBOARDING_COUNTRIES: Readonly<Record<string, { open: boolean; cities: readonly OnboardingCity[] }>> = {
  SE: { open: true, cities: [{ cityId: "stockholm_lan", name: "Stockholm län", zoneId: "Z001" }] },
  FR: { open: true, cities: [{ cityId: "paris", name: "Paris", zoneId: "FR-PC" }] },
  TN: { open: false, cities: [] },
};

export const FLEET_CODE = { prefix: "MV-", length: 5, alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" } as const;
