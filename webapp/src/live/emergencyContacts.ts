/**
 * BASE B13 (contract v0.18.26 §47, contract.json#phoneDataToServer.admin): the emergency contacts of a safety
 * incident's driver, read-only, from GET /admin/incidents/{incidentId}/emergency-contacts (incidents.read). The
 * server writes an audit line for every read, so the panel reads them only after the admin presses Show.
 */
export type EmergencyContact = { name: string; phone: string; relation?: string };
export type IncidentEmergencyContacts = { incidentId: string; driverId: string | null; items: EmergencyContact[]; updatedAt: string | null };

export function emergencyContactsPath(incidentId: string): string {
  return `/admin/incidents/${encodeURIComponent(incidentId)}/emergency-contacts`;
}

/** The answer, cleaned: only rows with a name and a phone number. */
export async function readEmergencyContacts(read: (path: string) => Promise<IncidentEmergencyContacts>, incidentId: string): Promise<IncidentEmergencyContacts> {
  const answer = await read(emergencyContactsPath(incidentId));
  const items = (answer.items ?? []).filter((c) => typeof c.name === "string" && c.name.trim() !== "" && typeof c.phone === "string" && c.phone.trim() !== "");
  return { incidentId: answer.incidentId ?? incidentId, driverId: answer.driverId ?? null, items, updatedAt: answer.updatedAt ?? null };
}
