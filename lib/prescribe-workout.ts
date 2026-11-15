import { exercises, stateSchema, type Item, type State, type Workout } from "./training.ts";

export type PrescribeInput = {
  tenantSchema: string;
  patientFhirId: string;
  mode: "add" | "replace";
  practitionerFhirId: string;
  practitionerName: string;
  workout: {
    name: string;
    items: {
      name: string;
      group?: string;
      sets: number;
      reps: number;
      rest: number;
      variation?: string;
    }[];
  };
};

/** Invalid prescription input (maps to HTTP 400). Messages are user-facing, in Portuguese. */
export class PrescribeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrescribeError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const byExactName = new Map(exercises.map((e) => [e.name, e]));
const byFoldedName = new Map(exercises.map((e) => [e.name.toLowerCase(), e]));

/** Exact (trimmed) name match first, then case-insensitive. `group` is only a hint and never rejects. */
function findExercise(name: string, _group?: string) {
  const trimmed = name.trim();
  return byExactName.get(trimmed) ?? byFoldedName.get(trimmed.toLowerCase());
}

function intField(value: unknown, field: string, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new PrescribeError(`${field} inválido em "${label}" (inteiro entre ${min} e ${max}).`);
  }
  return value;
}

/**
 * Applies a prescription to a training state without mutating it.
 * `add` appends the workout; `replace` drops existing workouts (sessions/active are kept).
 * Throws PrescribeError on invalid input or unknown exercises.
 */
export function applyPrescription(
  state: State,
  input: PrescribeInput,
): { state: State; workoutId: string } {
  if (input.mode !== "add" && input.mode !== "replace") {
    throw new PrescribeError('mode inválido (use "add" ou "replace").');
  }
  const practitionerName = (input.practitionerName ?? "").trim();
  if (
    typeof input.practitionerFhirId !== "string" ||
    !UUID_RE.test(input.practitionerFhirId.trim()) ||
    !practitionerName ||
    practitionerName.length > 120
  ) {
    throw new PrescribeError("practitioner inválido (id UUID e nome de até 120 caracteres).");
  }
  const workoutName = (input.workout?.name ?? "").trim();
  if (!workoutName || workoutName.length > 80) {
    throw new PrescribeError("Nome do treino inválido (1 a 80 caracteres).");
  }
  const rawItems = input.workout?.items;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 40) {
    throw new PrescribeError("O treino precisa de 1 a 40 itens.");
  }

  const items: Item[] = rawItems.map((raw) => {
    const label = typeof raw?.name === "string" ? raw.name.trim() : "";
    const exercise = label ? findExercise(label, raw.group) : undefined;
    if (!exercise) {
      throw new PrescribeError(`Exercício não encontrado na biblioteca: "${label}".`);
    }
    const variation = typeof raw.variation === "string" ? raw.variation.trim() : "";
    if (variation.length > 300) {
      throw new PrescribeError(`variation longa demais em "${exercise.name}" (máx. 300).`);
    }
    return {
      id: crypto.randomUUID(),
      name: exercise.name,
      group: exercise.group,
      ...(variation ? { variation } : {}),
      sets: intField(raw.sets, "sets", 1, 20, exercise.name),
      reps: intField(raw.reps, "reps", 1, 1000, exercise.name),
      rest: intField(raw.rest, "rest", 0, 1800, exercise.name),
    };
  });

  const now = new Date().toISOString();
  const workoutId = crypto.randomUUID();
  const workout: Workout = {
    id: workoutId,
    name: workoutName,
    createdAt: now,
    prescribed_by_practitioner_fhir_id: input.practitionerFhirId.trim().toLowerCase(),
    prescribed_by_name: practitionerName,
    prescribed_at: now,
    items,
  };

  const base = input.mode === "replace" ? [] : state.workouts;
  const order =
    input.mode === "replace"
      ? [workoutId]
      : [
          ...(state.workoutOrder ?? base.map((w) => w.id)),
          workoutId,
        ];
  const next: State = {
    ...structuredClone(state),
    workouts: [...structuredClone(base), workout],
    workoutOrder: order,
  };

  const parsed = stateSchema.safeParse(next);
  if (!parsed.success) {
    throw new PrescribeError("O treino resultante excede os limites permitidos.");
  }
  return { state: parsed.data, workoutId };
}
