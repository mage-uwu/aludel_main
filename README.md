# Forms builder

A client-side form builder in 377 lines of TypeScript. A **task** is a molecule and a **block**
is an atom: tasks contain blocks, and the document contains tasks. Stack **text**, **number**,
**photo** and **button** blocks into a task, give the task the **outcomes** it can end on
(pool inspection → `OPEN` / `CLOSED`; pool refill → `DRAIN AND FILL` / `PARTIAL FILL` / `SKIP`),
keep as many tasks as you like, and the whole document saves to `localStorage` as you type.

A button block and an outcome are different things: a button block is a button placed among the
questions, while the outcomes are the labelled buttons the task *finishes* on.

```
npm install
npm run dev        # http://localhost:5173
npm test           # the data layer's invariants
npm run build      # typecheck + production bundle
```

## Where things live

| File | Lines | Layer |
| --- | --- | --- |
| `src/id.ts` | 5 | Minting ids, with or without `crypto.randomUUID` |
| `src/list.ts` | 17 | `swap`, `unique`, `present` — the list rules every layer shares |
| `src/blocks.ts` | 79 | **Atom.** The `Block` union, its four actions, `reduceBlocks`, `parseBlock` |
| `src/tasks.ts` | 91 | **Molecule.** `Task`, `Outcome`, the zipper `Doc`, the root `reduce` |
| `src/storage.ts` | 56 | The outside world: load, persist, parsing, migrations, cross-tab sync |
| `src/App.tsx` | 123 | The builder: task strip, block toolbar, per-kind editor, outcome row |
| `src/main.tsx` | 6 | Mounts the app |
| `src/data.test.ts` | 177 | 22 tests over the data layer |

Dependencies run one way — `storage` → `tasks` → `blocks` → `list`/`id` — so the atom layer
knows nothing about containers and stays testable on its own.

## Invalid states are unrepresentable

**A block cannot be malformed.** `Block` is a discriminated union where each kind carries only
the settings it can use, so a photo block with a minimum value, or a required button, is not a
bug to guard against — it is a type that does not exist. The three places that dispatch on kind
are exhaustive *by construction*, so adding a fifth kind produces three compile errors until it
is handled everywhere: `DEFAULTS` (a complete default per kind), `VALID` (a storage validator
per kind), and `Body` (a rendering per kind, return-typed so a missing branch will not compile).

**A block cannot be orphaned.** A task owns its blocks by containment, not by id, so there is no
such thing as a block belonging to no task, to two tasks, or to a task that has been deleted.

**A task cannot be unfinishable.** `Outcomes` is a non-empty tuple, `readonly [Outcome,
...Outcome[]]`, so a task with nothing to end on is unwritable. Every edit goes through one
`setOutcomes`, which refuses a list that came out empty, so deleting the last outcome is
declined at the one place that can produce it — the UI also disables the button, but the type
is what makes it true. It pays off in reading, too: `task.outcomes[0]` needs no `undefined`
check anywhere in the app.

**A document cannot be empty or unfocused.** `Doc` is a zipper — the tasks `before` the open one,
the `open` one, the tasks `after` it — so "zero tasks" and "the open task doesn't exist" are both
unwritable. Nothing in the app checks for them, because nothing can produce them. Deleting the
last task hands back a fresh blank one; there is no empty case to fall into.

**A block or outcome edit cannot reach a task you can't see.** Because the open task is part of
the type, block and outcome actions carry no task id at all — they apply to `doc.open` and
nowhere else.

## Enterprise-grade CRUD, foolproof by default

One dispatch serves all three layers: every action is tagged `on: "task"`, `on: "outcome"` or
`on: "block"`, and the root reducer routes the last two into the open task. Reducers are pure
functions over `readonly` state, so state is replaced, never mutated.

- **Update is total.** Editing dispatches a whole, already-valid block (`{ ...block, label }`),
  so a partial patch cannot leave a block in a shape the type does not allow.
- **Reorder cannot fall off any list.** Blocks, tasks and outcomes all reorder through one
  `swap`, where an index outside the list is a no-op, and the arrows are disabled at each end.
- **Unknown ids are no-ops.** Opening or deleting a task that isn't there returns the document
  unchanged, by reference.
- **Deleting is safe.** Removing the open task opens its neighbour; removing a task that holds
  blocks asks first.
- **Number bounds cannot cross.** Min clamps to at most max, max to at least min, and
  non-numeric input reads as `0`.
- **Storage cannot poison the app.** Each task is salvaged as far as it is valid — a bad block is
  dropped without losing its task — and unreadable, blocked, or full storage costs nothing. The
  saved shape is the plain list of tasks; which one is open is a view concern, not data. Older
  documents are migrated on load: a v1 document (a bare list of blocks) becomes a single task,
  and a v2 task (no outcomes yet) is given one.

## Where the types stop

Making invalid states unrepresentable governs the code that is written; it says nothing about
data arriving from outside it. Everything below is a boundary rule, enforced at runtime, and
each one is here because a probe got through:

- **Nothing crosses the boundary unparsed.** `parseBlock` rebuilds a block field by field out of
  the fields its kind actually has, rather than checking a stored object and passing it along, so
  a block cannot arrive carrying properties its type forbids. The kind is looked up with
  `Object.hasOwn`, not `in` — `in` walks the prototype chain, where `constructor` and `toString`
  live, and both of them once passed as block kinds.
- **Ids are unique on the way in.** Duplicates are dropped for tasks, blocks and outcomes alike.
  Two blocks sharing an id meant one edit changed both, and one delete removed both.
- **Ids exist without a secure context.** `crypto.randomUUID` is secure-context-only, so over
  plain http it is missing and the app used to fail to render at all; `newId` falls back.
- **Labels cannot end up blank.** They may be empty while being typed, are filled in when the
  field is left, and are filled in again on load for anything written behind the app's back.
- **Typing is not committing.** `""`, `"-"` and `"2."` are all valid keystrokes on the way to a
  number, so the number fields keep raw text and commit on blur or Enter — sanitising every
  keystroke made a negative minimum impossible to type. Garbage reverts to the last good value.
- **Another tab's save is news, not a conflict.** A `storage` event makes this tab adopt the
  tasks that were saved, keeping whichever task it had open, and a document that arrived that
  way is never written back — so two tabs neither clobber each other nor ping-pong.

Still open, and known: a save refused for want of quota is swallowed silently, deleting a block
cannot be undone, and the inputs have no accessible names.
