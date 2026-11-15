export type EquipmentItem = { label: string };

const LABEL_MAX = 40;
const ITEMS_MAX = 30;

const INVALID_JSON_MESSAGE = "Resposta da IA não é JSON válido.";
const EMPTY_INVENTORY_MESSAGE =
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

function clampLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, LABEL_MAX);
}

export function normalizeEquipmentItems(items: unknown): EquipmentItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: EquipmentItem[] = [];
  for (const row of items) {
    if (out.length >= ITEMS_MAX) break;
    let label = "";
    if (typeof row === "string") {
      label = clampLabel(row);
    } else if (row && typeof row === "object" && !Array.isArray(row)) {
      label = clampLabel((row as { label?: unknown }).label);
    }
    if (!label) continue;
    const key = label.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label });
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