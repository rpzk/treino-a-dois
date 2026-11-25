const FREE_EXERCISE_DB_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

export type ExerciseVisual = {
  id: string;
  frames: [string, string];
};

export type ExerciseMedia = {
  visual: ExerciseVisual | null;
  videoSearchUrl: string;
  machineVideoSearchUrl: string | null;
  machineLabel: string | null;
};

type KeywordRule = {
  pattern: RegExp;
  id: string;
};

const EXACT_MAP: Record<string, string> = {
  "supino reto com barra": "Barbell_Bench_Press_-_Medium_Grip",
  "supino reto com halteres": "Dumbbell_Bench_Press",
  "supino inclinado com halteres": "Incline_Dumbbell_Press",
  "supino na maquina": "Machine_Bench_Press",
  "crucifixo com halteres": "Dumbbell_Flyes",
  "crucifixo na maquina": "Butterfly",
  "crucifixo na polia": "Cable_Crossover",
  crossover: "Cable_Crossover",
  "flexao de bracos": "Pushups",
  "flexao no trx": "Suspended_Push-Up",
  "puxada frontal": "Wide-Grip_Lat_Pulldown",
  "puxada com pegada neutra": "Close-Grip_Front_Lat_Pulldown",
  "remada baixa": "Seated_Cable_Rows",
  "remada curvada": "Bent_Over_Barbell_Row",
  "remada unilateral com halter": "One-Arm_Dumbbell_Row",
  "remada na maquina": "Leverage_Iso_Row",
  "remada no trx": "Suspended_Row",
  pulldown: "Straight-Arm_Pulldown",
  "barra fixa": "Pullups",
  "agachamento livre": "Barbell_Full_Squat",
  "agachamento no smith": "Smith_Machine_Squat",
  "agachamento goblet": "Goblet_Squat",
  "leg press 45": "Leg_Press",
  "leg press horizontal": "Leg_Press",
  "hack squat": "Hack_Squat",
  "cadeira extensora": "Leg_Extensions",
  "mesa flexora": "Lying_Leg_Curls",
  "cadeira flexora": "Seated_Leg_Curl",
  "flexora em pe": "Standing_Leg_Curl",
  "stiff com halteres": "Stiff-Legged_Dumbbell_Deadlift",
  "levantamento terra romeno": "Romanian_Deadlift",
  "afundo com halteres": "Dumbbell_Lunges",
  "agachamento bulgaro": "Barbell_Side_Split_Squat",
  "cadeira adutora": "Thigh_Adductor",
  "cadeira abdutora": "Thigh_Abductor",
  "elevacao pelvica": "Barbell_Hip_Thrust",
  "gluteo na polia": "Glute_Kickback",
  "panturrilha em pe": "Standing_Calf_Raises",
  "panturrilha sentado": "Seated_Calf_Raise",
  "desenvolvimento com halteres": "Dumbbell_Shoulder_Press",
  "desenvolvimento na maquina": "Machine_Shoulder_Military_Press",
  "elevacao lateral": "Side_Lateral_Raise",
  "elevacao frontal": "Front_Dumbbell_Raise",
  "crucifixo inverso": "Seated_Bent-Over_Rear_Delt_Raise",
  "face pull": "Face_Pull",
  "encolhimento com halteres": "Dumbbell_Shrug",
  "rosca direta": "Barbell_Curl",
  "rosca alternada": "Dumbbell_Alternate_Bicep_Curl",
  "rosca martelo": "Hammer_Curls",
  "rosca scott": "Preacher_Curl",
  "rosca na polia": "Cable_Hammer_Curls_-_Rope_Attachment",
  "triceps corda": "Triceps_Pushdown_-_Rope_Attachment",
  "triceps na polia com barra": "Triceps_Pushdown",
  "triceps testa": "Lying_Triceps_Press",
  "triceps frances": "Standing_Dumbbell_Triceps_Extension",
  "mergulho na maquina": "Dip_Machine",
  "abdominal no solo": "Crunches",
  "abdominal na maquina": "Ab_Crunch_Machine",
  "abdominal na polia": "Cable_Crunch",
  "elevacao de pernas": "Hanging_Leg_Raise",
  "prancha isometrica": "Plank",
  "rotacao de tronco na polia": "Cable_Russian_Twists",
};

const KEYWORD_RULES: KeywordRule[] = [
  { pattern: /flexao.*trx|trx.*flexao|suspens.*flexao/, id: "Suspended_Push-Up" },
  { pattern: /remada.*trx|trx.*remada|remada invertida/, id: "Suspended_Row" },
  { pattern: /supino.*inclinado/, id: "Incline_Dumbbell_Press" },
  { pattern: /supino.*halter/, id: "Dumbbell_Bench_Press" },
  { pattern: /supino.*barra/, id: "Barbell_Bench_Press_-_Medium_Grip" },
  { pattern: /supino|chest press|press arm/, id: "Machine_Bench_Press" },
  { pattern: /crucifixo.*inverso|posterior.*ombro/, id: "Seated_Bent-Over_Rear_Delt_Raise" },
  { pattern: /crucifixo.*(polia|cabo)|crossover|peck/, id: "Cable_Crossover" },
  { pattern: /crucifixo.*maquina|voador/, id: "Butterfly" },
  { pattern: /crucifixo/, id: "Dumbbell_Flyes" },
  { pattern: /flexao de brac|flexao/, id: "Pushups" },
  { pattern: /puxada.*neutra|puxada.*fechada/, id: "Close-Grip_Front_Lat_Pulldown" },
  { pattern: /puxada|pulldown|lat pull/, id: "Wide-Grip_Lat_Pulldown" },
  { pattern: /barra fixa|pull.?up/, id: "Pullups" },
  { pattern: /remada.*unilateral|serrote/, id: "One-Arm_Dumbbell_Row" },
  { pattern: /remada.*curvada/, id: "Bent_Over_Barbell_Row" },
  { pattern: /remada.*(baixa|cabo|polia|sentada)/, id: "Seated_Cable_Rows" },
  { pattern: /remada/, id: "Leverage_Iso_Row" },
  { pattern: /leg press/, id: "Leg_Press" },
  { pattern: /extensora|extensao de joelho/, id: "Leg_Extensions" },
  { pattern: /flexora.*em pe|flexao de joelho em pe/, id: "Standing_Leg_Curl" },
  { pattern: /mesa flexora|flexora deitad/, id: "Lying_Leg_Curls" },
  { pattern: /flexora/, id: "Seated_Leg_Curl" },
  { pattern: /hack/, id: "Hack_Squat" },
  { pattern: /smith/, id: "Smith_Machine_Squat" },
  { pattern: /goblet/, id: "Goblet_Squat" },
  { pattern: /bulgaro|split squat/, id: "Barbell_Side_Split_Squat" },
  { pattern: /afundo|passada|lunge/, id: "Dumbbell_Lunges" },
  { pattern: /agachamento|squat/, id: "Barbell_Full_Squat" },
  { pattern: /stiff/, id: "Stiff-Legged_Dumbbell_Deadlift" },
  { pattern: /romeno|terra/, id: "Romanian_Deadlift" },
  { pattern: /adutor/, id: "Thigh_Adductor" },
  { pattern: /abdutor/, id: "Thigh_Abductor" },
  { pattern: /elevacao pelvica|hip thrust/, id: "Barbell_Hip_Thrust" },
  { pattern: /gluteo|coice/, id: "Glute_Kickback" },
  { pattern: /panturrilha.*sentad/, id: "Seated_Calf_Raise" },
  { pattern: /panturrilha/, id: "Standing_Calf_Raises" },
  { pattern: /face pull/, id: "Face_Pull" },
  { pattern: /desenvolvimento.*(maquina|estacao|cabo)/, id: "Machine_Shoulder_Military_Press" },
  { pattern: /desenvolvimento|ombro/, id: "Dumbbell_Shoulder_Press" },
  { pattern: /elevacao lateral/, id: "Side_Lateral_Raise" },
  { pattern: /elevacao frontal/, id: "Front_Dumbbell_Raise" },
  { pattern: /encolhimento/, id: "Dumbbell_Shrug" },
  { pattern: /rosca.*martelo/, id: "Hammer_Curls" },
  { pattern: /rosca.*scott/, id: "Preacher_Curl" },
  { pattern: /rosca.*(polia|cabo|corda)/, id: "Cable_Hammer_Curls_-_Rope_Attachment" },
  { pattern: /rosca.*alternad/, id: "Dumbbell_Alternate_Bicep_Curl" },
  { pattern: /rosca|bicep/, id: "Barbell_Curl" },
  { pattern: /triceps.*corda/, id: "Triceps_Pushdown_-_Rope_Attachment" },
  { pattern: /triceps.*testa/, id: "Lying_Triceps_Press" },
  { pattern: /triceps.*frances/, id: "Standing_Dumbbell_Triceps_Extension" },
  { pattern: /mergulho|paralela/, id: "Dip_Machine" },
  { pattern: /triceps/, id: "Triceps_Pushdown" },
  { pattern: /prancha|plank/, id: "Plank" },
  { pattern: /rotacao|wood.?chop|lenhador|obliquo/, id: "Cable_Russian_Twists" },
  { pattern: /elevacao de perna/, id: "Hanging_Leg_Raise" },
  { pattern: /abdom.*(polia|cabo|corda)/, id: "Cable_Crunch" },
  { pattern: /abdom.*maquina/, id: "Ab_Crunch_Machine" },
  { pattern: /abdom|crunch/, id: "Crunches" },
];

function normalizeKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/°/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract a concise brand/model prefix from an equipment string (e.g. "BodyCraft X4 · Estação 2" -> "BodyCraft X4"). */
export function extractMachineLabel(equipment?: string): string | null {
  const raw = (equipment ?? "").trim();
  if (!raw) return null;
  const primary = raw.split(/[·\-–—(]/)[0]?.trim() ?? "";
  if (!primary || primary.length < 3) return null;
  // Treat generic accessories as not needing a separate "brand machine" link.
  if (
    /^(halteres?|barra|anilhas?|colchonete|banco|peso corporal|solo)$/i.test(
      primary,
    )
  ) {
    return null;
  }
  return primary.slice(0, 48);
}

/** Build a YouTube search URL filtered to short videos (<4 min, sp=EgIYAQ%3D%3D). */
export function buildShortVideoUrl(query: string): string {
  const params = new URLSearchParams({
    search_query: query.trim(),
    sp: "EgIYAQ==",
  });
  return `https://www.youtube.com/results?${params.toString()}`;
}

export function resolveExerciseMedia(
  name: string,
  equipment?: string,
): ExerciseMedia {
  const key = normalizeKey(name);
  let id: string | null = EXACT_MAP[key] ?? null;
  if (!id) {
    const matched = KEYWORD_RULES.find((rule) => rule.pattern.test(key));
    id = matched?.id ?? null;
  }
  const visual: ExerciseVisual | null = id
    ? {
        id,
        frames: [
          `${FREE_EXERCISE_DB_BASE}/${id}/0.jpg`,
          `${FREE_EXERCISE_DB_BASE}/${id}/1.jpg`,
        ],
      }
    : null;

  const machineLabel = extractMachineLabel(equipment);
  const videoSearchUrl = buildShortVideoUrl(`${name} execução correta`);
  const machineVideoSearchUrl = machineLabel
    ? buildShortVideoUrl(`${machineLabel} ${name}`)
    : null;

  return {
    visual,
    videoSearchUrl,
    machineVideoSearchUrl,
    machineLabel,
  };
}
