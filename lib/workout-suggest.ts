import { exercises } from "@/lib/training";
import { healthcoreAiComplete } from "@/lib/healthcore-ai";

export type SuggestedItem = {
  name: string;
  group: string;
  sets: number;
  reps: number;
  rest: number;
};

export type SuggestedWorkout = {
  name: string;
  items: SuggestedItem[];
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchExercise(name: string): { name: string; group: string } | null {
  const needle = normalize(name);
  if (!needle) return null;
  const exact = exercises.find((ex) => normalize(ex.name) === needle);
  if (exact) return exact;
  const partial = exercises.find(
    (ex) =>
      normalize(ex.name).includes(needle) || needle.includes(normalize(ex.name)),
  );
  return partial ?? null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

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

export function parseSuggestedWorkout(raw: string): SuggestedWorkout {
  const parsed = extractJsonObject(raw) as {
    name?: string;
    items?: Array<{
      name?: string;
      sets?: number;
      reps?: number;
      rest?: number;
    }>;
  };
  const name = String(parsed.name || "").trim().slice(0, 80);
  if (!name) throw new Error("A sugestão veio sem nome de treino.");
  const sourceItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items: SuggestedItem[] = [];
  for (const row of sourceItems) {
    const matched = matchExercise(String(row?.name || ""));
    if (!matched) continue;
    if (items.some((item) => item.name === matched.name)) continue;
    items.push({
      name: matched.name,
      group: matched.group,
      sets: clampInt(row?.sets, 1, 20, 3),
      reps: clampInt(row?.reps, 1, 1000, 10),
      rest: clampInt(row?.rest, 0, 1800, 90),
    });
    if (items.length >= 10) break;
  }
  if (items.length < 3) {
    throw new Error(
      "A sugestão não trouxe exercícios reconhecidos o bastante. Tente de novo.",
    );
  }
  return { name, items };
}

export async function suggestWorkout(input: {
  tenantSchema: string;
  focus?: string;
}): Promise<SuggestedWorkout> {
  const focus = (input.focus || "").trim().slice(0, 120);
  const catalog = exercises
    .map((ex) => `- ${ex.name} (${ex.group})`)
    .join("\n");

  const result = await healthcoreAiComplete({
    purpose: "fitcore.workout_suggest",
    tenantSchema: input.tenantSchema,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content: [
          "Você é o assistente de fichas do FitCore (HealthCore).",
          "Responda APENAS com um objeto JSON válido, sem markdown.",
          'Formato: {"name":"string","items":[{"name":"string","sets":3,"reps":10,"rest":90}]}',
          "Use somente nomes da biblioteca fornecida (copie o nome exatamente).",
          "Sugira entre 4 e 8 exercícios, treino realista para academia.",
          "Idioma: português do Brasil.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          focus
            ? `Monte uma ficha focada em: ${focus}.`
            : "Monte uma ficha equilibrada para iniciante/intermediário (full body ou AB).",
          "Biblioteca:",
          catalog,
        ].join("\n"),
      },
    ],
  });

  return parseSuggestedWorkout(result.content);
}
