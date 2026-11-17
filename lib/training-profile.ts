/** Shared profile id rules (safe for client + server). */

const HC_PROFILE_RE = /^hc_[0-9a-f]{32}$/;
/** Ops / SQLite linker: any safe key except retired couple-demo slots. */
const OPS_PROFILE_RE = /^[a-z][a-z0-9_]{1,63}$/;
const RETIRED_DEMO_KEYS = new Set(["lucas", "natalia"]);

/** Product profile ids — HealthCore-linked `hc_<patient_fhir_id without dashes>`. */
export function isValidTrainingProfileId(profile: string): boolean {
  return HC_PROFILE_RE.test(profile);
}

/**
 * Keys accepted by the SQLite linker / `linkExistingProfileToPatient`.
 * Rejects retired demo slots (`lucas` / `natalia`); prefer `hc_<32hex>`.
 */
export function isValidOpsProfileKey(profile: string): boolean {
  if (RETIRED_DEMO_KEYS.has(profile)) return false;
  return OPS_PROFILE_RE.test(profile);
}

export function isRetiredDemoProfileKey(profile: string): boolean {
  return RETIRED_DEMO_KEYS.has(profile);
}

export function profileKeyForPatient(patientId: string): string {
  return `hc_${patientId.replace(/-/g, "").toLowerCase()}`;
}
