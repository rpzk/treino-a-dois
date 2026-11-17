export const PORTAL_HOME_URL =
  process.env.NEXT_PUBLIC_HEALTHCORE_PORTAL_URL?.trim() ||
  "https://rp.rphealthtech.com/portal";

/** Display name from the FitCore / portal session; never from demo profile keys. */
export function displayNameForProfile(
  _profile: string,
  sessionDisplayName?: string | null,
): string {
  if (sessionDisplayName?.trim()) return sessionDisplayName.trim();
  return "Paciente";
}
