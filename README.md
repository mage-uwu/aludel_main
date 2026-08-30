# Forms builder

A client-side form builder in 228 lines of TypeScript. A **task** is a molecule and a **block**
is an atom: tasks contain blocks, and the document contains tasks. Stack **text**, **number**,
**photo** and **button** blocks into a task, keep as many tasks as you like, and the whole
document saves to `localStorage` as you type.

```
npm install
npm run dev        # http://localhost:5173
npm test           # the data layer's invariants
npm run build      # typecheck + production bundle
```

## Where things live

| File | Lines | Layer |
| --- | --- | --- |
| `src/blocks.ts` | 57 | **Atom.** The `Block` union, its four actions, `reduceBlocks`, validation |
| `src/tasks.ts` | 81 | **Molecule.** `Task`, the zipper `Doc`, the root `reduce`, storage |
| `src/App.tsx` | 84 | The builder: task strip, block toolbar, per-kind editor and preview |
| `src/main.tsx` | 6 | Mounts the app |
| `src/tasks.test.ts` | 82 | 10 tests over the data layer |

`tasks.ts` imports `blocks.ts` and never the reverse, so the atom layer knows nothing about
containers and stays testable on its own.

## Invalid states are unrepresentable

**A block cannot be malformed.** `Block` is a discriminated union where each kind carries only
the settings it can use, so a photo block with a minimum value, or a required button, is not a
bug to guard against — it is a type that does not exist. The three places that dispatch on kind
are exhaustive *by construction*, so adding a fifth kind produces three compile errors until it
is handled everywhere: `DEFAULTS` (a complete default per kind), `VALID` (a storage validator
per kind), and `Body` (a rendering per kind, return-typed so a missing branch will not compile).

**A block cannot be orphaned.** A task owns its blocks by containment, not by id, so there is no
such thing as a block belonging to no task, to two tasks, or to a task that has been deleted.

**A document cannot be empty or unfocused.** `Doc` is a zipper — the tasks `before` the open one,
the `open` one, the tasks `after` it — so "zero tasks" and "the open task doesn't exist" are both
unwritable. Nothing in the app checks for them, because nothing can produce them. Deleting the
last task hands back a fresh blank one; there is no empty case to fall into.

**A block edit cannot reach a task you can't see.** Because the open task is part of the type,
block actions carry no task id at all — they apply to `doc.open` and nowhere else.

## Enterprise-grade CRUD, foolproof by default

One dispatch serves both layers: every action is tagged `on: "task"` or `on: "block"`, and the
root reducer routes block actions into the open task's blocks. Reducers are pure functions over
`readonly` state, so state is replaced, never mutated.

- **Update is total.** Editing dispatches a whole, already-valid block (`{ ...block, label }`),
  so a partial patch cannot leave a block in a shape the type does not allow.
- **Reorder cannot fall off either list.** Out-of-range moves are no-ops for blocks and tasks
  alike, and the arrows are disabled at each end.
- **Unknown ids are no-ops.** Opening or deleting a task that isn't there returns the document
  unchanged, by reference.
- **Deleting is safe.** Removing the open task opens its neighbour; removing a task that holds
  blocks asks first.
- **Number bounds cannot cross.** Min clamps to at most max, max to at least min, and
  non-numeric input reads as `0`.
- **Storage cannot poison the app.** Each task is salvaged as far as it is valid — a bad block is
  dropped without losing its task — and unreadable, blocked, or full storage costs nothing. The
  saved shape is the plain list of tasks; which one is open is a view concern, not data. A v1
  document (a bare list of blocks) is lifted into a single task on load.
