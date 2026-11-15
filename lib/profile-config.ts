import type { ProfileId } from "./training-progress";

/** Legacy dual-profile display names (still valid profile ids). */
export const profileConfig: Record<ProfileId, { name: string; shortName: string }> = {
  lucas: { name: "Rafael", shortName: "Rafael" },
  natalia: { name: "Ana Amélia", shortName: "Ana" },
};

export const PORTAL_HOME_URL =
  process.env.NEXT_PUBLIC_HEALTHCORE_PORTAL_URL?.trim() ||
  "https://rp.rphealthtech.com/portal";

export function displayNameForProfile(
  profile: string,
  sessionDisplayName?: string | null,
): string {
  if (sessionDisplayName?.trim()) return sessionDisplayName.trim();
  if (profile === "lucas" || profile === "natalia") {
    return profileConfig[profile].name;
  }
  return "Paciente";
}
