import { isBlock, reduceBlocks, type Block, type BlockAction } from "./blocks";

// The molecule. A task owns its blocks outright — containment, not references — so a block
// cannot be orphaned, shared between tasks, or left pointing at a task that is gone.
export type TaskId = string & { readonly __taskId: unique symbol };
export type Task = { id: TaskId; title: string; blocks: readonly Block[] };

// A document is a zipper: the tasks before the open one, the open one, the tasks after it.
// So there is always exactly one open task and never zero tasks — neither is a case to handle.
export type Doc = { before: readonly Task[]; open: Task; after: readonly Task[] };

export const createTask = (): Task => ({ id: crypto.randomUUID() as TaskId, title: "Untitled form", blocks: [] });
export const tasks = (doc: Doc): readonly Task[] => [...doc.before, doc.open, ...doc.after];

// The one way to build a document: open the task at `i`, clamped into range. An empty list
// yields a fresh document rather than nothing, which is what keeps "zero tasks" unreachable.
const at = (list: readonly Task[], i: number): Doc => {
  const j = Math.min(Math.max(i, 0), list.length - 1);
  const open = list[j];
  return open ? { before: list.slice(0, j), open, after: list.slice(j + 1) } : { before: [], open: createTask(), after: [] };
};

// Task actions act on the document; rename and move need no id because they act on the open task.
export type TaskAction =
  | { on: "task"; type: "add" }
  | { on: "task"; type: "open"; id: TaskId }
  | { on: "task"; type: "rename"; title: string }
  | { on: "task"; type: "remove"; id: TaskId }
  | { on: "task"; type: "move"; by: 1 | -1 };
export type Action = TaskAction | BlockAction;

export const reduce = (doc: Doc, action: Action): Doc => {
  if (action.on === "block") return { ...doc, open: { ...doc.open, blocks: reduceBlocks(doc.open.blocks, action) } };
  const all = tasks(doc);
  switch (action.type) {
    case "add": return at([...all, createTask()], all.length);
    case "rename": return { ...doc, open: { ...doc.open, title: action.title } };
    case "open": {
      const i = all.findIndex((t) => t.id === action.id);
      return i < 0 ? doc : at(all, i); // an id that is not here changes nothing
    }
    case "remove": {
      const rest = all.filter((t) => t.id !== action.id);
      const i = rest.findIndex((t) => t.id === doc.open.id);
      return at(rest, i < 0 ? doc.before.length : i); // removing the open task opens its neighbour
    }
    case "move": {
      const [i, j] = [doc.before.length, doc.before.length + action.by];
      const swap = all[j];
      if (!swap) return doc; // a move off either end is a no-op
      const next = [...all];
      [next[i], next[j]] = [swap, doc.open];
      return at(next, j);
    }
  }
};

// Storage holds the plain list of tasks: which one is open is a view concern, not data.
// Every task is salvaged as far as it is valid, and anything unreadable costs a blank document.
const toTask = (v: unknown): Task | null => {
  const t = v as Record<string, unknown>;
  if (typeof t?.id !== "string" || typeof t.title !== "string" || !Array.isArray(t.blocks)) return null;
  return { id: t.id as TaskId, title: t.title, blocks: t.blocks.filter(isBlock) };
};

const [KEY, V1] = ["forms-builder/v2", "forms-builder/v1"];
const lift = (v1: string) => JSON.stringify([{ ...createTask(), blocks: JSON.parse(v1) }]); // v1 was a bare block list

export const load = (): Doc => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? lift(localStorage.getItem(V1) ?? "[]"));
    return at(Array.isArray(stored) ? stored.map(toTask).filter((t): t is Task => t !== null) : [], 0);
  } catch {
    return at([], 0);
  }
};

export const persist = (doc: Doc) => {
  try { localStorage.setItem(KEY, JSON.stringify(tasks(doc))); } catch { /* not remembered, still usable */ }
};

