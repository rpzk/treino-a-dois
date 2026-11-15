import type { ProfileId } from "./training-progress";

/** Display names for internal profile IDs (APIs/DB still use lucas|natalia). */
export const profileConfig: Record<ProfileId, { name: string; shortName: string }> = {
  lucas: { name: "Rafael", shortName: "Rafael" },
  natalia: { name: "Ana Amélia", shortName: "Ana" },
};

export const PORTAL_HOME_URL =
  process.env.NEXT_PUBLIC_HEALTHCORE_PORTAL_URL?.trim() ||
  "https://rp.rphealthtech.com/portal";
