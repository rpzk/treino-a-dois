import {
  formatInventoryForPrompt,
  type EquipmentItem,
} from "./equipment-inventory.ts";
import { exercises, exerciseGroups } from "./training.ts";
import { healthcoreAiComplete } from "./healthcore-ai.ts";
import { applyHealthMode, type ClinicalContext } from "./clinical-context.ts";

export type SuggestedItem = {
  name: string;
  group: string;
  equipment?: string;
  instructions?: string;
  variation?: string;
  sets: number;
  reps: number;
  rest: number;
};

export type SuggestedWorkout = {
  name: string;
  summary?: string;
  items: SuggestedItem[];
};

const CANONICAL_GROUPS = [
  ...Object.keys(exerciseGroups),
  "Mobilidade",
  "Geral",
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizeInstructions(value: unknown): string {
  if (Array.isArray(value)) {
    const steps = value
      .map((line) => clampText(line, 280))
      .filter(Boolean);
    return steps.join("\n").slice(0, 1200);
  }
  if (typeof value !== "string") return "";
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
}

function resolveGroup(rawGroup: unknown): string {
  const cleaned = clampText(rawGroup, 50);
  if (!cleaned) return "Geral";
  const needle = normalize(cleaned);
  const exact = CANONICAL_GROUPS.find((g) => normalize(g) === needle);
  if (exact) return exact;
  if (/peit|torax|chest/.test(needle)) return "Peito";
  if (/costa|dors|back/.test(needle)) return "Costas";
  if (/pern|coxa|glute|panturr|quadr|post|leg/.test(needle)) return "Pernas";
  if (/ombr|deltoid|trapez|shoulder/.test(needle)) return "Ombros";
  if (/bicep/.test(needle)) return "Bíceps";
  if (/tricep/.test(needle)) return "Tríceps";
  if (/abdom|core|lombar/.test(needle)) return "Abdômen";
  if (/cardio|aerob|condicion|esteira|bike|elipt/.test(needle)) return "Cardio";
  if (/mobil|along|aquec/.test(needle)) return "Mobilidade";
  return cleaned;
}

function resolveExercise(
  rawName: unknown,
  rawGroup: unknown,
): { name: string; group: string } | null {
  const cleanName = clampText(rawName, 120);
  const needle = normalize(cleanName);
  if (!needle) return null;
  const exact = exercises.find((ex) => normalize(ex.name) === needle);
  if (exact) return exact;
  // Partial library match only when the name doesn't add machine/modality specifics (like TRX, horizontal, em pé).
  const hasSpecificModality =
    /trx|espaldar|bola|elast|cabo|polia|horizontal|em pe|unilateral|saco|esteira|eliptico|spinning|trampolim|prancha/i.test(
      needle,
    );
  if (!hasSpecificModality) {
    const partial = exercises.find(
      (ex) =>
        normalize(ex.name).includes(needle) ||
        needle.includes(normalize(ex.name)),
    );
    if (partial) return partial;
  }
  return { name: cleanName, group: resolveGroup(rawGroup) };
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function extractJsonObject(raw: string): unknown {
  const trimmed = String(raw ?? "").trim();
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

function parseSingleItem(row: Record<string, unknown>): SuggestedItem | null {
  const resolved = resolveExercise(row?.name, row?.group);
  if (!resolved) return null;
  const equipment = clampText(row?.equipment, 160);
  const instructions = normalizeInstructions(row?.instructions);
  const variation = clampText(row?.variation, 300);
  const item: SuggestedItem = {
    name: resolved.name,
    group: resolved.group,
    sets: clampInt(row?.sets, 1, 20, 3),
    reps: clampInt(row?.reps, 1, 1000, 10),
    rest: clampInt(row?.rest, 0, 1800, 90),
  };
  if (equipment) item.equipment = equipment;
  if (instructions) item.instructions = instructions;
  if (variation) item.variation = variation;
  return item;
}

export function parseSuggestedWorkout(raw: string): SuggestedWorkout {
  const parsed = extractJsonObject(raw) as {
    name?: string;
    summary?: string;
    items?: Array<Record<string, unknown>>;
  };
  const name = clampText(parsed?.name, 80);
  if (!name) throw new Error("A sugestão veio sem nome de treino.");
  const summary = clampText(parsed?.summary, 280);
  const sourceItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items: SuggestedItem[] = [];
  for (const row of sourceItems) {
    if (!row || typeof row !== "object") continue;
    const item = parseSingleItem(row);
    if (!item) continue;
    if (
      items.some(
        (existing) => normalize(existing.name) === normalize(item.name),
      )
    ) {
      continue;
    }
    items.push(item);
    if (items.length >= 12) break;
  }
  if (items.length < 3) {
    throw new Error(
      "A sugestão não trouxe exercícios reconhecidos o bastante. Tente de novo.",
    );
  }
  return summary ? { name, summary, items } : { name, items };
}

export function parseSwappedExercise(raw: string): SuggestedItem {
  const parsed = extractJsonObject(raw) as Record<string, unknown>;
  const target =
    parsed?.item && typeof parsed.item === "object"
      ? (parsed.item as Record<string, unknown>)
      : parsed;
  const item = parseSingleItem(target);
  if (!item) {
    throw new Error("A alternativa veio incompleta. Tente de novo.");
  }
  return item;
}

export function buildSuggestSystem(ctx?: ClinicalContext | null): string {
  return applyHealthMode(
    [
      "Você é o assistente de montagem de treinos do FitCore (HealthCore).",
      "Responda APENAS com um objeto JSON válido, sem markdown.",
      'Formato: {"name":"string","summary":"string curta explicando o plano","items":[{"name":"string","group":"Peito|Costas|Pernas|Ombros|Bíceps|Tríceps|Abdômen|Cardio","equipment":"Aparelho e estação exata","instructions":"1. Ajuste...\\n2. Execução...\\n3. Postura/respiração...","variation":"opcional","sets":3,"reps":10,"rest":90}]}',
      "Quando o usuário informar equipamentos (especialmente estações compactas multi-função de condomínio), monte o treino 100% compatível com o que ele realmente tem disponível.",
      "Em `equipment`, indique exatamente em qual equipamento/estação/ajuste fazer o exercício (ex.: \"BodyCraft X4 · Estação 2 (Puxador alto)\").",
      "Em `instructions`, escreva instruções práticas e claras em 3 passos curtos separados por quebra de linha: (1) ajuste do banco/polia/pegada e posição inicial, (2) como executar o movimento com controle, (3) ponto de atenção postural e respiração.",
      "Prefira nomes claros da biblioteca quando houver equivalente exato, mas você PODE propor exercícios reais do equipamento do usuário (ex.: Leg press horizontal, Flexora em pé, Remada no TRX, Rotação de tronco na polia).",
      "Sugira entre 6 e 9 exercícios bem equilibrados para o usuário poder escolher quais manter ou trocar.",
      "Idioma: português do Brasil.",
    ].join(" "),
    ctx,
  );
}

export function buildSwapSystem(ctx?: ClinicalContext | null): string {
  return applyHealthMode(
    [
      "Você é o assistente de substituição de exercícios do FitCore (HealthCore).",
      "Responda APENAS com um objeto JSON válido, sem markdown.",
      'Formato: {"item":{"name":"string","group":"Peito|Costas|Pernas|Ombros|Bíceps|Tríceps|Abdômen|Cardio","equipment":"Aparelho e estação exata","instructions":"1. Ajuste...\\n2. Execução...\\n3. Postura/respiração...","variation":"opcional","sets":3,"reps":10,"rest":90}}',
      "Sugira EXATAMENTE 1 exercício substituto para o mesmo grupo muscular, 100% factível com os equipamentos disponíveis, diferente dos exercícios já listados ou recusados.",
      "Inclua `equipment` específico e `instructions` passo a passo em 3 linhas curtas.",
      "Idioma: português do Brasil.",
    ].join(" "),
    ctx,
  );
}

export async function suggestWorkout(input: {
  tenantSchema: string;
  patientFhirId?: string;
  focus?: string;
  level?: string;
  durationMinutes?: number;
  exclude?: string[];
  equipmentInventory?: EquipmentItem[];
  clinicalContext?: ClinicalContext | null;
}): Promise<SuggestedWorkout> {
  const focus = clampText(input.focus, 120);
  const level = clampText(input.level, 40);
  const duration =
    typeof input.durationMinutes === "number" &&
    Number.isFinite(input.durationMinutes)
      ? Math.min(120, Math.max(15, Math.round(input.durationMinutes)))
      : null;
  const exclude = (input.exclude ?? [])
    .map((x) => clampText(x, 80))
    .filter(Boolean)
    .slice(0, 20);

  const catalog = exercises
    .map((ex) => `- ${ex.name} (${ex.group})`)
    .join("\n");
  const inventory = input.equipmentInventory ?? [];
  const formattedInventory = formatInventoryForPrompt(inventory);
  const equipmentHint = formattedInventory
    ? [
        "Equipamentos disponíveis do usuário (USE APENAS o que for possível com estes equipamentos ou peso corporal):",
        formattedInventory,
      ].join("\n")
    : "";

  const result = await healthcoreAiComplete({
    purpose: "fitcore.workout_suggest",
    tenantSchema: input.tenantSchema,
    patientFhirId: input.patientFhirId,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content: buildSuggestSystem(input.clinicalContext),
      },
      {
        role: "user",
        content: [
          focus
            ? `Monte uma ficha focada em: ${focus}.`
            : "Monte uma ficha equilibrada de corpo inteiro (Full Body) adaptada aos equipamentos disponíveis.",
          level ? `Nível do praticante: ${level}.` : "",
          duration ? `Duração desejada: cerca de ${duration} minutos.` : "",
          exclude.length
            ? `Não inclua estes exercícios (o usuário optou por não fazer): ${exclude.join(", ")}.`
            : "",
          equipmentHint,
          "Biblioteca de referência (você pode usar nomes daqui ou exercícios específicos dos aparelhos acima):",
          catalog,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  return parseSuggestedWorkout(result.content);
}

export async function swapSuggestedExercise(input: {
  tenantSchema: string;
  patientFhirId?: string;
  exerciseName: string;
  group: string;
  currentExercises?: string[];
  excludedExercises?: string[];
  reason?: string;
  equipmentInventory?: EquipmentItem[];
  clinicalContext?: ClinicalContext | null;
}): Promise<SuggestedItem> {
  const currentName = clampText(input.exerciseName, 120);
  const group = resolveGroup(input.group);
  const reason = clampText(input.reason, 160);
  const blocked = [
    currentName,
    ...(input.currentExercises ?? []),
    ...(input.excludedExercises ?? []),
  ]
    .map((x) => clampText(x, 100))
    .filter(Boolean);
  const uniqueBlocked = [...new Set(blocked)].slice(0, 25);
  const formattedInventory = formatInventoryForPrompt(
    input.equipmentInventory ?? [],
  );

  const result = await healthcoreAiComplete({
    purpose: "fitcore.exercise_swap",
    tenantSchema: input.tenantSchema,
    patientFhirId: input.patientFhirId,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content: buildSwapSystem(input.clinicalContext),
      },
      {
        role: "user",
        content: [
          `Exercício a substituir: ${currentName} (grupo: ${group}).`,
          reason ? `Motivo/preferência do usuário: ${reason}.` : "",
          `NÃO repita nenhum destes exercícios: ${uniqueBlocked.join(", ")}.`,
          formattedInventory
            ? `Equipamentos disponíveis:\n${formattedInventory}`
            : "Sem inventário específico — sugira uma alternativa comum de academia ou peso corporal.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  return parseSwappedExercise(result.content);
}
