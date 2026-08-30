# Forms builder

A client-side form template builder in 145 lines of TypeScript. Stack **text**, **number**,
**photo** and **button** blocks into a template; every block is editable in place and the whole
template is saved to `localStorage` as you type.

```
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle
```

## Where things live

| File | Lines | What it is |
| --- | --- | --- |
| `src/model.ts` | 69 | The domain: the `Block` union, the four actions, the reducer, storage |
| `src/App.tsx` | 70 | The builder: toolbar, block list, per-kind editor and preview |
| `src/main.tsx` | 6 | Mounts the app |

## Invalid states are unrepresentable

`Block` is a discriminated union where each kind carries only the settings it can use, so a photo
block with a minimum value, or a required button, is not a bug to guard against — it is a type
that does not exist. The three places that dispatch on kind are exhaustive *by construction*, so
adding a fifth kind to the union produces three compile errors until it is handled everywhere:

- `DEFAULTS` — a complete default per kind, so a new block is never half-built
- `VALID` — a validator per kind, applied to everything read back from storage
- `Body` — a rendering per kind, with a `ReactElement` return type that rejects a missing branch

## Enterprise-grade CRUD, foolproof by default

Four actions cover the lifecycle — `add`, `save`, `remove`, `move` — and the reducer is a pure
function over a `readonly Block[]`, so state is only ever replaced, never mutated.

- **Update is total.** Editing dispatches a whole, already-valid block (`{ ...block, label }`),
  so a partial patch cannot leave a block in a shape the type does not allow.
- **Reorder cannot fall off the list.** Out-of-range moves are no-ops, and the arrows are disabled
  at each end.
- **Number bounds cannot cross.** Min clamps to at most max, max clamps to at least min, and
  non-numeric input reads as `0`.
- **Storage cannot poison the app.** Anything read back that is not provably a `Block` is dropped;
  unreadable, blocked, or full storage is caught and the session keeps working.
