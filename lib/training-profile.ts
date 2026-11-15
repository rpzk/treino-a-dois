/** Shared profile id rules (safe for client + server). */
export function isValidTrainingProfileId(profile: string): boolean {
  return /^(lucas|natalia|hc_[0-9a-f]{32})$/.test(profile);
}

export function profileKeyForPatient(patientId: string): string {
  return `hc_${patientId.replace(/-/g, "").toLowerCase()}`;
}
