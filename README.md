# Forms builder

A client-side form builder in 285 lines of TypeScript. A **task** is a molecule and a **block**
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
| `src/list.ts` | 9 | `swap`, the one place a "move up / move down" is made safe at the ends |
| `src/blocks.ts` | 56 | **Atom.** The `Block` union, its four actions, `reduceBlocks`, validation |
| `src/tasks.ts` | 83 | **Molecule.** `Task`, `Outcome`, the zipper `Doc`, the root `reduce` |
| `src/storage.ts` | 34 | The outside world: load, persist, validation, migrations |
| `src/App.tsx` | 97 | The builder: task strip, block toolbar, per-kind editor, outcome row |
| `src/main.tsx` | 6 | Mounts the app |
| `src/data.test.ts` | 125 | 16 tests over the data layer |

Dependencies run one way — `storage` → `tasks` → `blocks` → `list` — so the atom layer knows
nothing about containers and stays testable on its own.

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
