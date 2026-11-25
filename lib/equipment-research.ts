import {
  normalizeEquipmentItems,
  isResearchableMachine,
  type EquipmentItem,
} from "./equipment-inventory.ts";
import { healthcoreAiComplete } from "./healthcore-ai.ts";

const RESEARCH_SYSTEM = [
  "Você é um especialista em equipamentos de musculação e academias compactas de condomínio.",
  "Pesquise ou use o conhecimento técnico real dos aparelhos informados (especialmente multi-estações compactas e máquinas com marca/modelo).",
  "Responda APENAS com um objeto JSON válido, sem markdown, em português do Brasil.",
  'Formato: {"items":[{"label":"string","brand_model":"string","stations":["string"],"notes":"string","researched_exercises":["string"]}]}',
  "Regras:",
  "- Preserve o campo `label` exatamente igual ao item original correspondente.",
  "- Para máquinas multi-estação ou compactas (ex.: BodyCraft X4, estações 3 ou 4 torres), preencha `brand_model` (modelo exato se identificado), `stations` (lista clara de cada estação/torre/módulo e ajuste), `notes` (resumo prático de uso na máquina) e `researched_exercises` (10 a 20 exercícios reais possíveis naquela máquina).",
  "- Para equipamentos simples (halteres, espaldar, TRX, barra fixa, esteira), você pode mantê-los ou adicionar 4 a 8 exercícios principais em `researched_exercises` e uma nota curta.",
  "- Não invente acessórios que o usuário não informou.",
].join(" ");

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
    throw new Error("Resposta da pesquisa não é JSON válido.");
  }
}

export function mergeResearchedEquipment(
  original: EquipmentItem[],
  researched: EquipmentItem[],
): EquipmentItem[] {
  const byKey = new Map<string, EquipmentItem>();
  for (const item of researched) {
    byKey.set(item.label.toLocaleLowerCase("pt-BR"), item);
  }
  return original.map((item) => {
    const exact = byKey.get(item.label.toLocaleLowerCase("pt-BR"));
    const match =
      exact ??
      researched.find(
        (cand) =>
          item.brand_model &&
          cand.brand_model &&
          cand.brand_model
            .toLocaleLowerCase("pt-BR")
            .includes(item.brand_model.toLocaleLowerCase("pt-BR").slice(0, 10)),
      );
    if (!match) return item;
    return normalizeEquipmentItems([
      {
        label: item.label,
        brand_model: match.brand_model || item.brand_model,
        stations: match.stations?.length ? match.stations : item.stations,
        notes: match.notes || item.notes,
        researched_exercises: match.researched_exercises?.length
          ? match.researched_exercises
          : item.researched_exercises,
      },
    ])[0];
  });
}

export async function researchEquipmentInventory(input: {
  tenantSchema: string;
  patientFhirId?: string;
  items: EquipmentItem[];
}): Promise<{ items: EquipmentItem[]; researchedCount: number }> {
  const clean = normalizeEquipmentItems(input.items);
  if (!clean.length) return { items: [], researchedCount: 0 };

  const targets = clean.filter(isResearchableMachine);
  const toQuery = targets.length > 0 ? targets : clean.slice(0, 6);

  const description = toQuery
    .map((item) => {
      const parts = [`- label: "${item.label}"`];
      if (item.brand_model) parts.push(`brand_model: "${item.brand_model}"`);
      if (item.stations?.length) {
        parts.push(`stations observadas: ${item.stations.join("; ")}`);
      }
      if (item.notes) parts.push(`notas: ${item.notes}`);
      return parts.join(" | ");
    })
    .join("\n");

  const result = await healthcoreAiComplete({
    purpose: "fitcore.equipment_research",
    tenantSchema: input.tenantSchema,
    patientFhirId: input.patientFhirId,
    jsonMode: true,
    messages: [
      { role: "system", content: RESEARCH_SYSTEM },
      {
        role: "user",
        content: [
          "Pesquise como funcionam estes equipamentos de academia (especialmente modelos compactos/multi-estação) e liste as estações/ajustes e os exercícios possíveis em cada um:",
          description,
        ].join("\n"),
      },
    ],
  });

  const parsed = extractJsonObject(result.content) as { items?: unknown };
  const researched = normalizeEquipmentItems(parsed?.items);
  const merged = mergeResearchedEquipment(clean, researched);
  const researchedCount = merged.filter(
    (it) => (it.researched_exercises?.length ?? 0) > 0 || (it.stations?.length ?? 0) > 0,
  ).length;
  return { items: merged, researchedCount };
}
