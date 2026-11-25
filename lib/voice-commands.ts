export type VoiceCommand =
  | { type: "complete_set"; kg?: number; reps?: number }
  | { type: "set_load"; kg?: number; deltaKg?: number }
  | { type: "set_reps"; reps: number }
  | { type: "skip_rest" }
  | { type: "add_rest"; seconds: number }
  | { type: "pause_rest" }
  | { type: "resume_rest" }
  | { type: "read_instructions" }
  | { type: "unknown"; transcript: string };

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
};

const TENS: Record<string, number> = {
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
};

function normalizeSpeech(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s,.+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convert simple spoken Portuguese numbers ("quarenta e cinco", "dois e meio") into digits. */
function replaceSpokenNumbers(text: string): string {
  let out = text;
  // "quarenta e cinco" -> "45"
  for (const [tenWord, tenVal] of Object.entries(TENS)) {
    for (const [unitWord, unitVal] of Object.entries(SMALL_NUMBERS)) {
      if (unitVal >= 1 && unitVal <= 9) {
        out = out.replace(
          new RegExp(`\\b${tenWord}\\s+e\\s+${unitWord}\\b`, "g"),
          String(tenVal + unitVal),
        );
      }
    }
    out = out.replace(new RegExp(`\\b${tenWord}\\b`, "g"), String(tenVal));
  }
  for (const [word, val] of Object.entries(SMALL_NUMBERS)) {
    out = out.replace(new RegExp(`\\b${word}\\b`, "g"), String(val));
  }
  // "2 e meio" -> "2.5", "40 e meio" -> "40.5"
  out = out.replace(/\b(\d+)\s+e\s+mei[oa]\b/g, "$1.5");
  return out;
}

function parseNumber(raw: string): number | undefined {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 2000) return undefined;
  return n;
}

function extractKg(text: string): number | undefined {
  // "45 quilos", "42,5 kg", "peso 40", "carga 35", "com 50"
  const unitMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|quilos?)\b/);
  if (unitMatch) return parseNumber(unitMatch[1]);
  const prefixMatch = text.match(/\b(?:peso|carga)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\b/);
  if (prefixMatch) return parseNumber(prefixMatch[1]);
  return undefined;
}

function extractReps(text: string): number | undefined {
  const unitMatch = text.match(/(\d+)\s*(?:reps?|repeticoe?s?|vezes?)\b/);
  if (unitMatch) {
    const n = Number(unitMatch[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 1000) return n;
  }
  const fizMatch = text.match(/\bfiz\s+(\d+)\b(?!\s*(?:kg|kilos?|quilos?))/);
  if (fizMatch) {
    const n = Number(fizMatch[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 1000) return n;
  }
  return undefined;
}

export function parseVoiceCommand(rawTranscript: string): VoiceCommand {
  const norm = replaceSpokenNumbers(normalizeSpeech(rawTranscript));
  if (!norm) return { type: "unknown", transcript: rawTranscript };

  if (/\b(como\s+faz|como\s+executar|instruco|ler\s+instru|explica|repetir\s+instru)/.test(norm)) {
    return { type: "read_instructions" };
  }

  if (/\b(pausar|pausa)\b.*descanso|\bpausar\s+timer\b/.test(norm)) {
    return { type: "pause_rest" };
  }

  if (/\b(retomar|continuar)\b.*descanso|\bretomar\s+timer\b/.test(norm)) {
    return { type: "resume_rest" };
  }

  if (/\b(mais\s+30|adiciona\s+30|aumenta\s+descanso|\+30)\b/.test(norm)) {
    return { type: "add_rest", seconds: 30 };
  }

  if (/\b(pular|pula)\b.*descanso|\b(pular\s+descanso|pular|proxima\s+serie|proximo\s+exercicio)\b/.test(norm)) {
    return { type: "skip_rest" };
  }

  // Relative load adjustment: "aumenta 5 quilos", "sobe 2,5", "diminui 5"
  const deltaUp = norm.match(/\b(?:aumenta|aumentar|sobe|subir|soma|mais)\s+(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|quilos?)?\b/);
  if (deltaUp && !/\b(segund|descanso|rep)/.test(norm)) {
    const delta = parseNumber(deltaUp[1]);
    if (delta !== undefined && delta > 0) {
      return { type: "set_load", deltaKg: delta };
    }
  }
  const deltaDown = norm.match(/\b(?:diminui|diminuir|abaixa|abaixar|baixa|tirar|tira|menos)\s+(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|quilos?)?\b/);
  if (deltaDown && !/\b(segund|descanso|rep)/.test(norm)) {
    const delta = parseNumber(deltaDown[1]);
    if (delta !== undefined && delta > 0) {
      return { type: "set_load", deltaKg: -delta };
    }
  }

  const kg = extractKg(norm);
  const reps = extractReps(norm);
  const hasCompleteVerb =
    /\b(feita|feito|pronto|pronta|conclui\w*|terminei|terminou|acabou|acabei|ok|bora|fiz|marca|marcar|completa\w*)\b/.test(
      norm,
    );

  // If user says "feita", "fiz 12 com 40 quilos", or gives both kg + reps -> complete the set!
  if (hasCompleteVerb || (kg !== undefined && reps !== undefined)) {
    return {
      type: "complete_set",
      ...(kg !== undefined ? { kg } : {}),
      ...(reps !== undefined ? { reps } : {}),
    };
  }

  if (kg !== undefined) {
    return { type: "set_load", kg };
  }

  if (reps !== undefined) {
    return { type: "set_reps", reps };
  }

  return { type: "unknown", transcript: rawTranscript };
}
