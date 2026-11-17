import type { Session } from "./training";

export type TrainingProgress = {
  status: "active" | "finished" | "idle";
  name: string | null;
  done: number;
  total: number;
  percent: number;
};

export function summarizeProgress(
  active: Session | null,
  latest: Session | null,
  now = Date.now(),
): TrainingProgress {
  // Keep a recently finished session visible briefly after wrap-up.
  const finishedAt = latest?.finished ? Date.parse(latest.finished) : NaN;
  const recent =
    Number.isFinite(finishedAt) &&
    finishedAt <= now &&
    now - finishedAt <= 2 * 60 * 60 * 1000;
  const session = active ?? (recent ? latest : null);
  if (!session)
    return { status: "idle", name: null, done: 0, total: 0, percent: 0 };
  const logs = session.items.flatMap((item) => item.logs);
  const done = logs.filter((log) => log.done).length;
  return {
    status: active ? "active" : "finished",
    name: session.name,
    done,
    total: logs.length,
    percent: logs.length ? Math.round((done / logs.length) * 100) : 0,
  };
}
