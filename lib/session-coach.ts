import { healthcoreAiComplete } from "./healthcore-ai.ts";

export type SessionCoachTip = {
  tip_technique: string;
  tip_progression: string | null;
};

export type SessionCoachInput = {
  tenantSchema: string;
  exerciseName: string;
  group?: string;
  sets: number;
  reps: number;
  rest: number;
  previousKg?: number | null;
  previousReps?: number | null;
  setIndex?: number;
};

const INVALID_JSON_MESSAGE = "Resposta da IA não é JSON válido.";

function extractJsonObject(raw: string): unknown {
  const trimmed = String(raw ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        throw new Error(INVALID_JSON_MESSAGE);
      }
    }
    throw new Error(INVALID_JSON_MESSAGE);
  }
}

function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export function parseSessionCoachTip(raw: string): SessionCoachTip {
  const root = extractJsonObject(raw);
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error(INVALID_JSON_MESSAGE);
  }
  const parsed = root as {
    tip_technique?: unknown;
    tip_progression?: unknown;
  };
  if (typeof parsed.tip_technique !== "string") {
    throw new Error("A dica veio sem frase de técnica.");
  }
  const tip_technique = clampText(parsed.tip_technique, 220);
  if (!tip_technique) {
    throw new Error("A dica veio sem frase de técnica.");
  }
  const progRaw = parsed.tip_progression;
  const tip_progression =
    typeof progRaw === "string" ? clampText(progRaw, 220) || null : null;
  return { tip_technique, tip_progression };
}

export async function coachExercise(
  input: SessionCoachInput,
): Promise<SessionCoachTip> {
  const name = clampText(input.exerciseName, 80);
  if (!name) throw new Error("Exercício inválido.");

  const hasPrev =
    typeof input.previousKg === "number" ||
    typeof input.previousReps === "number";

  const result = await healthcoreAiComplete({
    purpose: "fitcore.session_coach",
    tenantSchema: input.tenantSchema,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content: [
          "Você é o coach de sessão do FitCore (HealthCore).",
          "Responda APENAS com JSON válido, sem markdown.",
          'Formato: {"tip_technique":"string","tip_progression":"string"|null}',
          "No máximo ~2 frases curtas no total (técnica + progressão).",
          "tip_technique: uma frase curta de execução/postura (obrigatória).",
          "tip_progression: uma frase curta de carga/reps se houver histórico; senão null.",
          "Sem diagnóstico médico, sem PHI, sem inventar lesões.",
          "Idioma: português do Brasil.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Exercício: ${name}`,
          input.group ? `Grupo: ${clampText(input.group, 40)}` : null,
          `Prescrição: ${input.sets}x${input.reps}, descanso ${input.rest}s`,
          typeof input.setIndex === "number"
            ? `Série atual (1-based): ${input.setIndex}`
            : null,
          hasPrev
            ? `Última sessão: ${input.previousKg ?? "?"} kg × ${input.previousReps ?? "?"} reps`
            : "Sem histórico de carga para este exercício.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  return parseSessionCoachTip(result.content);
}
