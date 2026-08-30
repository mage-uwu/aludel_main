import { parseBlock } from "./blocks";
import { present, unique } from "./list";
import { at, createOutcome, createTask, setOutcomes, tasks, type Doc, type Outcome, type OutcomeId, type Task, type TaskId } from "./tasks";

// The outside world. Storage holds the plain list of tasks — which one is open is a view
// concern, not data — and nothing read back is trusted: every task is rebuilt field by field,
// duplicate ids are dropped, and anything unreadable costs a blank document, never a broken one.
const [KEY, V2, V1] = ["forms-builder/v3", "forms-builder/v2", "forms-builder/v1"];

const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; } // storage can be blocked outright
};
const items = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);
const parseList = (raw: string | null): readonly unknown[] => {
  try { return items(JSON.parse(raw ?? "[]")); } catch { return []; }
};
const name = (v: unknown, fallback: string): string | null => (typeof v === "string" ? v.trim() || fallback : null);

const toOutcome = (v: unknown): Outcome | null => {
  const o = v as Record<string, unknown>;
  const label = name(o?.label, "Done");
  return typeof o?.id === "string" && label !== null ? { id: o.id as OutcomeId, label } : null;
};

const toTask = (v: unknown): Task | null => {
  const t = v as Record<string, unknown>;
  const title = name(t?.title, "Untitled task");
  if (typeof t?.id !== "string" || title === null) return null;
  const blocks = unique(items(t.blocks).map(parseBlock).filter(present));
  const outcomes = unique(items(t.outcomes).map(toOutcome).filter(present));
  return setOutcomes({ id: t.id as TaskId, title, blocks, outcomes: [createOutcome("Done")] }, outcomes);
};

const parseTasks = (raw: string | null): readonly Task[] => unique(parseList(raw).map(toTask).filter(present));
// v1 was a bare list of blocks: one task holding whichever of them are still valid.
const liftV1 = (raw: string | null): readonly Task[] => {
  const blocks = unique(parseList(raw).map(parseBlock).filter(present));
  return blocks.length ? [{ ...createTask(), blocks }] : [];
};

export const load = (): Doc => {
  const raw = read(KEY) ?? read(V2);
  return at(raw !== null ? parseTasks(raw) : liftV1(read(V1)), 0);
};

export const persist = (doc: Doc) => {
  try { localStorage.setItem(KEY, JSON.stringify(tasks(doc))); } catch { /* not remembered, still usable */ }
};

// Another tab saving the document is not a conflict to resolve but news to accept: its tasks
// are the ones on disk, so this tab takes them rather than overwriting them with its own.
export const onExternalChange = (adopt: (tasks: readonly Task[]) => void) => {
  const sync = (e: StorageEvent) => { if (e.key === KEY) adopt(parseTasks(e.newValue)); };
  window.addEventListener("storage", sync);
  return () => window.removeEventListener("storage", sync);
};
