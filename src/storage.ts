import { isBlock } from "./blocks";
import { at, createOutcome, createTask, setOutcomes, tasks, type Doc, type Outcome, type OutcomeId, type Task, type TaskId } from "./tasks";

// The outside world. Storage holds the plain list of tasks — which one is open is a view
// concern, not data — and nothing read back is trusted: each task is salvaged as far as it
// is valid, and anything unreadable costs a blank document rather than a broken one.
const toOutcome = (v: unknown): Outcome | null => {
  const o = v as Record<string, unknown>;
  return typeof o?.id === "string" && typeof o.label === "string" ? { id: o.id as OutcomeId, label: o.label } : null;
};

const toTask = (v: unknown): Task | null => {
  const t = v as Record<string, unknown>;
  if (typeof t?.id !== "string" || typeof t.title !== "string" || !Array.isArray(t.blocks)) return null;
  const outcomes = (Array.isArray(t.outcomes) ? t.outcomes : []).map(toOutcome).filter((o): o is Outcome => o !== null);
  const task = { id: t.id as TaskId, title: t.title, blocks: t.blocks.filter(isBlock), outcomes: [createOutcome("Done")] as const };
  return setOutcomes(task, outcomes); // an empty list is refused, so the default outcome stands
};

const [KEY, V2, V1] = ["forms-builder/v3", "forms-builder/v2", "forms-builder/v1"];
const liftV1 = (blocks: string) => JSON.stringify([{ ...createTask(), blocks: JSON.parse(blocks) }]); // v1 was a bare block list

export const load = (): Doc => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(V2) ?? liftV1(localStorage.getItem(V1) ?? "[]"));
    return at(Array.isArray(stored) ? stored.map(toTask).filter((t): t is Task => t !== null) : [], 0);
  } catch {
    return at([], 0);
  }
};

export const persist = (doc: Doc) => {
  try { localStorage.setItem(KEY, JSON.stringify(tasks(doc))); } catch { /* not remembered, still usable */ }
};
