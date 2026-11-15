import { defaultIssuer, exchangeSecret } from "./healthcore-ai.ts";

/**
 * Contexto clínico mínimo vindo do HealthCore (somente com TCLE).
 * Nunca persistido no FitCore: buscado a cada requisição.
 */
export type ClinicalCondition = {
  description: string;
  clinical_status?: string | null;
};

export type ClinicalContext = {
  consented: boolean;
  age_years?: number | null;
  sex?: string | null;
  conditions: ClinicalCondition[];
};

const FETCH_TIMEOUT_MS = 4000;
const MAX_CONDITIONS = 12;
const MAX_CONDITION_CHARS = 120;

/** Termos de marca que jamais podem aparecer em prompts ou na UI. */
export const BANNED_BRAND_PATTERN = /pro\s*-?\s*ser|uronal/i;

/** Fragmento interno do Modo saúde (nunca citar marcas). */
export const HEALTH_SYSTEM_FRAGMENT = [
  "Você orienta treino para saúde: regularidade (~3x/semana), progressão gradual,",
  "adaptação conservadora nas primeiras semanas, movimentos controlados, aquecimento.",
  "Respeite as condições listadas com cautela genérica; não diagnostique.",
  "Use apenas exercícios da biblioteca fornecida.",
].join(" ");

export async function fetchClinicalContext(input: {
  issuer: string;
  secret: string;
  tenantSchema: string;
  patientFhirId: string;
  fetchImpl?: typeof fetch;
}): Promise<ClinicalContext | null> {
  let issuer = input.issuer.trim().replace(/\/$/, "");
  if (issuer.startsWith("http://")) {
    issuer = `https://${issuer.slice("http://".length)}`;
  }
  const qs = new URLSearchParams({
    patient_fhir_id: input.patientFhirId,
    tenant_schema: input.tenantSchema,
  });
  const url = `${issuer}/api/v1/internal/fitcore/clinical-context/?${qs}`;
  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: { "X-FitCore-Exchange-Secret": input.secret },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return normalizeClinicalContext(await response.json());
  } catch {
    return null;
  }
}

export function normalizeClinicalContext(raw: unknown): ClinicalContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const consented = r.consented === true;
  if (!consented) return { consented: false, conditions: [] };
  const conditions: ClinicalCondition[] = [];
  if (Array.isArray(r.conditions)) {
    for (const row of r.conditions) {
      const description =
        row && typeof (row as { description?: unknown }).description === "string"
          ? (row as { description: string }).description
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, MAX_CONDITION_CHARS)
          : "";
      if (!description || BANNED_BRAND_PATTERN.test(description)) continue;
      const status = (row as { clinical_status?: unknown }).clinical_status;
      conditions.push({
        description,
        clinical_status: typeof status === "string" ? status.slice(0, 40) : null,
      });
      if (conditions.length >= MAX_CONDITIONS) break;
    }
  }
  const age = Number(r.age_years);
  return {
    consented: true,
    age_years: Number.isFinite(age) && age >= 0 && age < 130 ? Math.round(age) : null,
    sex: typeof r.sex === "string" ? r.sex.slice(0, 20) : null,
    conditions,
  };
}

/** Busca contexto para a sessão FitCore atual (env do servidor). */
export async function fetchClinicalContextForSession(session: {
  patientFhirId: string;
  tenantSchema: string;
}): Promise<ClinicalContext | null> {
  try {
    return await fetchClinicalContext({
      issuer: defaultIssuer(),
      secret: exchangeSecret(),
      tenantSchema: session.tenantSchema,
      patientFhirId: session.patientFhirId,
    });
  } catch {
    return null;
  }
}

/** Bloco textual com perfil/condições (sem identificadores do paciente). */
export function formatClinicalBlock(ctx: ClinicalContext): string {
  const lines: string[] = [];
  const profile: string[] = [];
  if (typeof ctx.age_years === "number") profile.push(`${ctx.age_years} anos`);
  if (ctx.sex) profile.push(`sexo: ${ctx.sex}`);
  if (profile.length) lines.push(`Perfil: ${profile.join(", ")}.`);
  if (ctx.conditions.length) {
    lines.push("Condições de saúde informadas:");
    for (const c of ctx.conditions) {
      lines.push(`- ${c.description}${c.clinical_status ? ` (${c.clinical_status})` : ""}`);
    }
  } else {
    lines.push("Nenhuma condição de saúde registrada.");
  }
  return lines.join("\n");
}

/** Acrescenta regras de Modo saúde ao system prompt apenas quando há TCLE. */
export function applyHealthMode(
  baseSystem: string,
  ctx: ClinicalContext | null | undefined,
): string {
  if (!ctx?.consented) return baseSystem;
  return [baseSystem, HEALTH_SYSTEM_FRAGMENT, formatClinicalBlock(ctx)].join("\n");
}
