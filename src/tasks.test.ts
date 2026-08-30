import { beforeEach, expect, test } from "vitest";
import { createBlock } from "./blocks";
import { load, persist, reduce, tasks, type Doc, type TaskId } from "./tasks";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
} as Storage;
beforeEach(() => store.clear());

const add = (doc: Doc) => reduce(doc, { on: "task", type: "add" });
const drop = (doc: Doc, id = doc.open.id) => reduce(doc, { on: "task", type: "remove", id });

test("a document always has exactly one open task", () => {
  const doc = load();
  expect(tasks(doc)).toEqual([doc.open]);
});

test("adding a task opens it and keeps the others", () => {
  const doc = add(add(load()));
  expect(tasks(doc)).toHaveLength(3);
  expect(doc.open).toBe(tasks(doc).at(-1));
});

test("removing the open task opens its neighbour", () => {
  const doc = drop(add(add(load())));
  expect(tasks(doc)).toHaveLength(2);
  expect(doc.open).toBe(tasks(doc).at(-1));
});

test("removing the last task leaves a blank one, never none", () => {
  const doc = drop(load());
  expect(tasks(doc)).toEqual([doc.open]);
  expect(doc.open.blocks).toEqual([]);
});

test("an id that is not in the document changes nothing", () => {
  const doc = add(load());
  const ghost = "not-a-task" as TaskId;
  expect(reduce(doc, { on: "task", type: "open", id: ghost })).toBe(doc);
  expect(tasks(drop(doc, ghost))).toHaveLength(2);
});

test("moving the open task past either end is a no-op", () => {
  const doc = add(load());
  expect(reduce(doc, { on: "task", type: "move", by: 1 })).toBe(doc);
  const moved = reduce(doc, { on: "task", type: "move", by: -1 });
  expect(moved.open).toBe(doc.open);
  expect(moved.before).toEqual([]);
});

test("block edits land in the open task only", () => {
  const doc = reduce(add(load()), { on: "block", type: "add", kind: "text" });
  expect(doc.open.blocks).toHaveLength(1);
  expect(doc.before[0]?.blocks).toEqual([]);
});

test("tasks round-trip through storage", () => {
  const doc = reduce(reduce(add(load()), { on: "task", type: "rename", title: "Signup" }), { on: "block", type: "add", kind: "photo" });
  persist(doc);
  expect(tasks(load())).toEqual(tasks(doc));
});

test("damaged storage is salvaged, never trusted", () => {
  store.set("forms-builder/v2", JSON.stringify([
    { id: "a", title: "Keep", blocks: [{ id: "b", kind: "number", label: "n", required: false, min: 9, max: 1 }, "junk"] },
    { id: "c", blocks: [] }, // no title
    42,
  ]));
  const doc = load();
  expect(tasks(doc)).toHaveLength(1);
  expect(doc.open.title).toBe("Keep");
  expect(doc.open.blocks).toEqual([]); // min > max is not a number block
});

test("a v1 block list is lifted into one task", () => {
  store.set("forms-builder/v1", JSON.stringify([createBlock("text")]));
  const doc = load();
  expect(tasks(doc)).toHaveLength(1);
  expect(doc.open.blocks).toHaveLength(1);
});
