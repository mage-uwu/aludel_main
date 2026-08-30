import { reduceBlocks, type Block, type BlockAction } from "./blocks";
import { newId } from "./id";
import { swap } from "./list";

// The molecule. A task owns its blocks outright — containment, not references — so a block
// cannot be orphaned, shared between tasks, or left pointing at a task that is gone.
// It also owns its outcomes: the labelled buttons it can end on, one of which finishes it.
export type TaskId = string & { readonly __taskId: unique symbol };
export type OutcomeId = string & { readonly __outcomeId: unique symbol };
export type Outcome = { id: OutcomeId; label: string };
export type Outcomes = readonly [Outcome, ...Outcome[]]; // never empty: a task always ends somewhere
export type Task = { id: TaskId; title: string; blocks: readonly Block[]; outcomes: Outcomes };

// A document is a zipper: the tasks before the open one, the open one, the tasks after it.
// So there is always exactly one open task and never zero tasks — neither is a case to handle.
export type Doc = { before: readonly Task[]; open: Task; after: readonly Task[] };

export const createOutcome = (label: string): Outcome => ({ id: newId(), label });
export const createTask = (): Task => ({ id: newId(), title: "Untitled task", blocks: [], outcomes: [createOutcome("Done")] });
export const tasks = (doc: Doc): readonly Task[] => [...doc.before, doc.open, ...doc.after];

// The one way to build a document: open the task at `i`, clamped into range. An empty list
// yields a fresh document rather than nothing, which is what keeps "zero tasks" unreachable.
export const at = (list: readonly Task[], i: number): Doc => {
  const j = Math.min(Math.max(i, 0), list.length - 1);
  const open = list[j];
  return open ? { before: list.slice(0, j), open, after: list.slice(j + 1) } : { before: [], open: createTask(), after: [] };
};

// The one way to change a task's outcomes: a list that came out empty is refused, so the
// "at least one outcome" guarantee holds for every edit without a check at each call site.
export const setOutcomes = (task: Task, list: readonly Outcome[]): Task => {
  const [first, ...rest] = list;
  return first ? { ...task, outcomes: [first, ...rest] } : task;
};

// Task actions act on the document; rename and move need no id because they act on the open task.
// Outcome actions need no task id at all — the open task is the only one they can reach.
export type TaskAction =
  | { on: "task"; type: "add" }
  | { on: "task"; type: "open"; id: TaskId }
  | { on: "task"; type: "rename"; title: string }
  | { on: "task"; type: "remove"; id: TaskId }
  | { on: "task"; type: "move"; by: 1 | -1 };
export type DocAction = { on: "doc"; type: "adopt"; tasks: readonly Task[] };
export type OutcomeAction =
  | { on: "outcome"; type: "add" }
  | { on: "outcome"; type: "rename"; id: OutcomeId; label: string }
  | { on: "outcome"; type: "remove"; id: OutcomeId }
  | { on: "outcome"; type: "move"; id: OutcomeId; by: 1 | -1 };
export type Action = DocAction | TaskAction | OutcomeAction | BlockAction;

const reduceOutcomes = (task: Task, action: OutcomeAction): Task => {
  const list = task.outcomes;
  switch (action.type) {
    case "add": return setOutcomes(task, [...list, createOutcome("Outcome")]);
    case "rename": return setOutcomes(task, list.map((o) => (o.id === action.id ? { ...o, label: action.label } : o)));
    case "remove": return setOutcomes(task, list.filter((o) => o.id !== action.id)); // the last one is refused
    case "move": {
      const i = list.findIndex((o) => o.id === action.id);
      return setOutcomes(task, swap(list, i, i + action.by));
    }
  }
};

export const reduce = (doc: Doc, action: Action): Doc => {
  if (action.on === "block") return { ...doc, open: { ...doc.open, blocks: reduceBlocks(doc.open.blocks, action) } };
  if (action.on === "outcome") return { ...doc, open: reduceOutcomes(doc.open, action) };
  if (action.on === "doc") {
    const i = action.tasks.findIndex((t) => t.id === doc.open.id);
    return at(action.tasks, i < 0 ? doc.before.length : i); // keep looking at the same task if it survived
  }
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
      return all[j] ? at(swap(all, i, j), j) : doc; // a move off either end is a no-op
    }
  }
};
