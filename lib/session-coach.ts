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

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Resposta da IA não é JSON válido.");
  }
}

function clampText(value: unknown, max: number): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

export function parseSessionCoachTip(raw: string): SessionCoachTip {
  const parsed = extractJsonObject(raw) as {
    tip_technique?: unknown;
    tip_progression?: unknown;
  };
  const tip_technique = clampText(parsed.tip_technique, 220);
  if (!tip_technique) {
    throw new Error("A dica veio sem frase de técnica.");
  }
  const progRaw = parsed.tip_progression;
  const tip_progression =
    progRaw === null || progRaw === undefined
      ? null
      : clampText(progRaw, 220) || null;
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

  const { healthcoreAiComplete } = await import("@/lib/healthcore-ai");

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