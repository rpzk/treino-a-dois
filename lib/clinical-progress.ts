import { localDay, weekStart } from "./training-stats.ts";

export type ClinicalProgress = {
  linked: boolean;
  sessions_this_week: number;
  last_session: { name: string; finished_at: string } | null;
  active_workout_name: string | null;
};

export function buildClinicalProgress(input: {
  linked: boolean;
  sessions: Array<{ name: string; finished: string | null }>;
  activeName: string | null;
  todayDay: string;
}): ClinicalProgress {
  if (!input.linked) {
    return {
      linked: false,
      sessions_this_week: 0,
      last_session: null,
      active_workout_name: null,
    };
  }
  const ws = weekStart(input.todayDay);
  const finished = input.sessions.filter((s) => !!s.finished);
  const sessions_this_week = finished.filter(
    (s) => weekStart(localDay(s.finished!)) === ws,
  ).length;
  const latest = finished
    .slice()
    .sort((a, b) => Date.parse(b.finished!) - Date.parse(a.finished!))[0];
  return {
    linked: true,
    sessions_this_week,
    last_session: latest
      ? { name: latest.name, finished_at: latest.finished! }
      : null,
    active_workout_name: input.activeName,
  };
}