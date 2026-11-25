export type EquipmentItem = {
  label: string;
  brand_model?: string;
  stations?: string[];
  notes?: string;
  researched_exercises?: string[];
};

const LABEL_MAX = 40;
const BRAND_MODEL_MAX = 100;
const STATION_MAX = 120;
const STATIONS_MAX = 10;
const NOTES_MAX = 300;
const RESEARCHED_EXERCISE_MAX = 80;
const RESEARCHED_EXERCISES_MAX = 25;
const ITEMS_MAX = 30;

/** Exported so API routes can map these to user-facing HTTP responses. */
export const INVALID_JSON_MESSAGE = "Resposta da IA não é JSON válido.";
export const EMPTY_INVENTORY_MESSAGE =
  "Nenhum equipamento foi detectado na resposta.";

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

function clampString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizeStringList(
  value: unknown,
  itemMax: number,
  listMax: number,
): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (out.length >= listMax) break;
    const cleaned = clampString(entry, itemMax);
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export function normalizeEquipmentItems(items: unknown): EquipmentItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Map<string, number>();
  const out: EquipmentItem[] = [];
  for (const row of items) {
    if (out.length >= ITEMS_MAX) break;
    let label = "";
    let brand_model = "";
    let stations: string[] = [];
    let notes = "";
    let researched_exercises: string[] = [];
    if (typeof row === "string") {
      label = clampString(row, LABEL_MAX);
    } else if (row && typeof row === "object" && !Array.isArray(row)) {
      const obj = row as Record<string, unknown>;
      label = clampString(obj.label, LABEL_MAX);
      brand_model = clampString(obj.brand_model ?? obj.brandModel, BRAND_MODEL_MAX);
      stations = normalizeStringList(obj.stations, STATION_MAX, STATIONS_MAX);
      notes = clampString(obj.notes, NOTES_MAX);
      researched_exercises = normalizeStringList(
        obj.researched_exercises ?? obj.researchedExercises,
        RESEARCHED_EXERCISE_MAX,
        RESEARCHED_EXERCISES_MAX,
      );
    }
    if (!label) continue;
    const key = label.toLocaleLowerCase("pt-BR");
    const existingIndex = seen.get(key);
    if (existingIndex !== undefined) {
      // Merge richer details if a duplicate label appears with extra metadata.
      const prev = out[existingIndex];
      const merged: EquipmentItem = { ...prev };
      if (!merged.brand_model && brand_model) merged.brand_model = brand_model;
      if (stations.length) {
        merged.stations = normalizeStringList(
          [...(merged.stations ?? []), ...stations],
          STATION_MAX,
          STATIONS_MAX,
        );
      }
      if (!merged.notes && notes) merged.notes = notes;
      if (researched_exercises.length) {
        merged.researched_exercises = normalizeStringList(
          [...(merged.researched_exercises ?? []), ...researched_exercises],
          RESEARCHED_EXERCISE_MAX,
          RESEARCHED_EXERCISES_MAX,
        );
      }
      out[existingIndex] = merged;
      continue;
    }
    const item: EquipmentItem = { label };
    if (brand_model) item.brand_model = brand_model;
    if (stations.length) item.stations = stations;
    if (notes) item.notes = notes;
    if (researched_exercises.length) {
      item.researched_exercises = researched_exercises;
    }
    seen.set(key, out.length);
    out.push(item);
  }
  return out;
}

export function parseEquipmentVision(raw: string): EquipmentItem[] {
  const root = extractJsonObject(raw);
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error(INVALID_JSON_MESSAGE);
  }
  const normalized = normalizeEquipmentItems(
    (root as { items?: unknown }).items,
  );
  if (normalized.length === 0) {
    throw new Error(EMPTY_INVENTORY_MESSAGE);
  }
  return normalized;
}

/** True when an equipment item represents a multi-station or named machine worth researching. */
export function isResearchableMachine(item: EquipmentItem): boolean {
  if (item.brand_model) return true;
  if (item.stations && item.stations.length > 0) return true;
  return /esta[çc][ãa]o|multi|torre|bodycraft|technogym|movement|polia|crossover|smith|compact/i.test(
    `${item.label} ${item.notes ?? ""}`,
  );
}

/** Serialize equipment inventory with full station/research details for LLM prompts. */
export function formatInventoryForPrompt(items: EquipmentItem[]): string {
  if (!items.length) return "";
  return items
    .map((item) => {
      const head = item.brand_model
        ? `- ${item.label} (Marca/Modelo: ${item.brand_model})`
        : `- ${item.label}`;
      const details: string[] = [];
      if (item.stations?.length) {
        details.push(`  Estações/módulos: ${item.stations.join("; ")}`);
      }
      if (item.notes) {
        details.push(`  Detalhes: ${item.notes}`);
      }
      if (item.researched_exercises?.length) {
        details.push(
          `  Exercícios possíveis nesta máquina: ${item.researched_exercises.join(", ")}`,
        );
      }
      return details.length ? `${head}\n${details.join("\n")}` : head;
    })
    .join("\n");
}
