# Aludel

Trades do repeating things, on a schedule, at a place, sometimes against a balance.
Aludel is the ledger of that work.

The whole machine is one recurrence:

```
ledger′ = ledger + fact          append: guarded, tiny, the only thing that must be defended
view    = f(ledger, now)         observe: pure, cheap, cannot corrupt anything
```

Office declares the future. Field logs the past. Every screen is a reading of the
difference. Pending, overdue, balance, history, "what did Jack do Friday" — none of these
are stored; they are what the ledger looks like from `now`.

## The five nouns

Each clause of the sentence demands one noun, and there are no others.

```ts
Actor     { id, email, role: "admin" | "office" | "field" }          // who works
Site      { id, client: { name, address, email },                    // where work lands
            services: [{ template, anchor, skips, allotments? }] }   //   …and against what balance
Template  { id, version, signedBy, tasks: [Task] }                   // what the work is
Form      { id, template, version, site, dispatched, meta }          // one round of paperwork
Entry     { id, form, taskKey, window: { from, due }, assignee?,     // one task, done once
            logged?: { at, actor, values: { blockKey: v }, outcomeKey } }
```

Tasks, blocks, and outcomes are the template's syntax tree, not entities — but tasks are
first-class *within* it, because the field lives in a list of entries filtered by task:

```ts
Task      { key, title, cadence: { every, unit, withinDays }, blocks: [Block], outcomes: [Outcome] }
Block     { key, kind: "text" | "number" | "photo" | "button", …only that kind's settings }
Outcome   { key, label, cost }
```

Roles nest: field ⊂ office ⊂ admin. Office/field is a *mode* of the one PWA, not a
permission. The team is not a record — the team **is** the ledger (one Durable Object per
team; isolation is structural, not a WHERE clause).

## The eight facts

The append surface. Every fact is `{ seq, at, actor, via? } + payload`; `via: "agent"`
marks a fact drafted by the agent and committed by a human.

| fact         | payload                                        | who may append    |
| ------------ | ---------------------------------------------- | ----------------- |
| `granted`    | subject, role                                  | admin             |
| `declared`   | site (whole; latest declaration wins)          | office            |
| `signed`     | template (whole new version)                   | office            |
| `bound`      | site ↔ template, anchor, skips, allotments     | office            |
| `dispatched` | form + its entries, each with a window         | office, scheduler |
| `logged`     | entry, values, outcome                         | field             |
| `corrected`  | entry, values, outcome, reason                 | per policy        |
| `rewindowed` | entry, new due, reason                         | office            |

That's the entire API — of the app, of the sync protocol, and of the agent.

## The laws

1. **The ledger only grows.** Nothing updates, nothing deletes; later facts supersede
   earlier ones, and both remain readable forever.
2. **`now` is an argument.** No stored value changes because time passed. Overdue is
   `pending ∧ now > due`, computed at the eye, correct on a phone that hasn't synced
   in a month — and `f(ledger, last Friday 5pm)` is the audit view for free.
3. **Keys are minted once, typed once, never reused.** Task, block, and outcome keys are
   protobuf field numbers: rename is free, retype is a new key. The editor enforces this;
   it is the one thing that can shatter history, silently.
4. **Versions pin rendering; keys carry data.** An entry renders with the template version
   its form pinned. A query reads every version that shares the key. Monday's record
   never rots; the chlorine vector never breaks.
5. **An entry is logged once, by one actor, with one outcome.** There is no "skipped" —
   NO_ACCESS is a logging whose outcome costs 0. Two states, four lenses
   (scheduled / pending / overdue / logged), one writer.
6. **The ledger never refuses a well-formed fact from the field; it orders them.** Offline
   sync is a union: push queued facts, pull since seq. If two logs land on one entry, the
   first is the log and the rest fold into corrections. Nothing a tradesman writes in a
   basement is ever discarded.
7. **Every aggregate carries its denominator.** Answers are `{ value, n, coverage }`,
   never a bare number. "47 tabs" is a lie; "47 tabs across 12 of 31 visits recording it"
   is glass.
8. **The agent drafts; a human's fact commits.** The agent speaks the same eight facts and
   the same calculator — no side door to secure. Its declares and dispatches become real
   only as a human's fact, marked `via: "agent"`. Reading, it may do freely.

## The observations

All pure, all `f(ledger, now)`:

```
status(e)   = logged            if e.logged
              scheduled         if now < from        (office sees it; field doesn't yet)
              pending           if from ≤ now ≤ due
              overdue           otherwise
late(e)     = logged.at > due                        (lateness survives into history)
balance     = allotment − Σ cost(outcome)            per site × task, when bound
```

And two read calls — the whole read surface, and the oracle's meat and bones:

```
find(filter) → entries                    filter: site? task? actor? status? window?
ask(channel, aggregation, scope, window) → { value, n, coverage }

channel      template.task.block | template.task.outcome     (a straight vector through history)
aggregation  number:  sum · avg · min · max · last
             outcome: count per key · cost-weighted sum
             photo:   count · presence          text: last · count
scope        team | client | site | actor
window       any time range
```

The kind decides which aggregations are legal, so the agent cannot express an invalid
question — the same move that made invalid blocks unrepresentable, applied to reads.
`find` answers "did Keegan do Mike's last Wednesday?"; `ask` answers "how much chlorine
this season?". Between them, every question the office asks out loud.

## The agent — one voice, two roles

One agent, one conversation, two verbs:

- **The oracle** reads freely: `find` and `ask`, no confirmation, no ceremony. Every answer
  cites the ledger lines it read (their seqs), so "Keegan logged Mike's Wednesday 2:14 pm,
  outcome CLOSED" is a claim you can tap through to the fact — answers with receipts, per
  law 7, never a bare number.
- **The hand** drafts facts: "dispatch a new form at Mike's" becomes a `dispatched` fact
  rendered as a preview card; the human's tap commits it, marked `via: "agent"`, per law 8.

One thread does both: "how many visits does Mike have left?" → "two" → "alright, dispatch
the drain" — the second message reuses the first answer's grounding. Authoring a template
and dispatching daily work are the same agent at different depths, not different agents.

## The same five nouns, three trades

|          | Mike's hot tubs               | Ted's ranch                | Bill's ski lift             |
| -------- | ----------------------------- | -------------------------- | --------------------------- |
| Site     | each tub's address            | each pasture               | each lift                   |
| Template | Tub report                    | Range check                | Lift inspection             |
| Tasks    | test weekly · drain 10-weekly | ride fence · salt monthly  | chairs daily · torque monthly |
| Channels | chlorine tabs (number)        | posts repaired (number)    | worn grips (number)         |
| Outcomes | OPEN·CLOSED·NO_ACCESS·DANGER  | RODE·BLOCKED·WASHOUT       | PASS·FAIL·HOLD              |
| Balance  | 13 visits / season            | —                          | —                           |

Most companies need one or two templates, ever. Ninety percent of use is dispatching
forms from templates that already exist; the agent authors a template about twice in a
company's lifetime and dispatches every day.

## v1 boundaries

**In:** the ledger + folds; office authoring and dispatch; field list → log with offline
queue (IndexedDB); scheduler materializing entries a rolling six weeks ahead; photos as
content-hash in the fact, bytes queued to R2; auth via pre-solved OAuth (Cloudflare
Access / Google), email → team; the two agents.

**Out:** routing, invoicing, client portal, real-time collab, hour-based cadence
(calendar only), permissions beyond the three roles, media beyond photos.

**Defaults awaiting sign-off:** corrections — field may correct its own entry same-day,
office may correct anything, corrections visible everywhere with attribution.

## Stack

Vite + React + strict TypeScript PWA (one app, two modes) · Cloudflare Workers, one
SQLite-backed Durable Object per team holding the ledger, R2 for photos · auth is Google
OIDC verified in the Worker (~80 lines, session as a signed HTTP-only cookie) — identity
is Google's problem, authorization is the `granted` facts · the agent on the Claude API,
tool surface = the eight facts + `find` + `ask`.

Budget: the app is ≤ 800 lines of TypeScript (tests, CSS and config uncounted), which
holds because the agent is the office UI — chat and preview cards replace a hand-built
template editor.

The core — nouns, facts, folds, calculator — should hold under a thousand lines, and
stay there. The mass lives at the edges (offline shell, sync, blob queue, agent eval),
and must never leak inward.
