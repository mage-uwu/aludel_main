# Aludel

The spec is SPEC.md — five nouns, eight facts, eight laws. Read it before touching
`src/` or `worker/`. Non-negotiables that are easy to lose:

- The app is ≤ 800 lines of TypeScript; `scripts/loc.sh` gates the build. Tests, CSS,
  and config are uncounted. New code pays for itself by trimming real fat, never by
  moving the goalposts.
- Every write goes through `guard()`; every view is `f(ledger, now)`; task/block/outcome
  keys are minted once, never retyped, never reused.
- Nothing is ever erased — the ledger is append-only, so "delete a report" is **retirement**:
  a new version carrying `retired`, still inside the eight facts. It leaves the shelf and
  `plan()` stops minting work from it; every logged entry keeps rendering against the version
  it pinned, and dispatched work stays the crew's to finish. Only `retire_template` may set
  the flag (never `edit_template`), and only a typed **YES** commits it — the button is
  disabled while one is staged. Any future destructive act joins that same gate.
- Field work is allocated and filtered by **lists** (routes/crews): a service binding's
  `list` and `assignee` flow onto every entry it mints, the `steered` fact re-routes one
  entry, and the field UI's chips filter by list. Allocation is writing a name on work.
- The agent is named Aludel. It drafts; a human's fact commits (`via: "agent"`). Its tool
  surface is the eight facts + `find` + `ask`, nothing else; its model id is config
  (`OPENAI_MODEL`), never hardcoded. Template changes go through typed tools only —
  `new_template` starts the interview, `edit_template` stages the next version (the worker
  owns version numbers, key slugs, and label hygiene; the model never hand-rolls a `signed`
  fact) — and the guard refuses any fact type outside the eight (`default:` is load-bearing;
  runtime JSON is not bound by our union). Staged drafts render as prose cards, never JSON.
  The office is one shared tool with two operators:
  every `/api/agent` call carries the screen (`view: { tab, draft, drafts }`), so whatever
  is open to the human is open to the agent — and an agent edit to an open draft plays
  from that draft, never from the ledger, so it can't stomp the human's pencil work.
- One renderer for a block, everywhere: `Input` in `src/field.tsx`. The office preview and
  the field logger mount the very same control — `set` given makes it live, `set` omitted
  makes it a disabled preview — so what you build is literally what the crew taps. Never
  fork a second "preview" rendering of a block; add the affordance to `Input` instead.
- A routine is a **checklist of cues, not a program counter**: each cue declares when it is
  still unfulfilled (`need(draft)`), and the next question is simply the first cue the draft
  has not answered. Any cue accepts an **op** instead of an answer — a correction re-routes
  and the cue stays pending — so order guides without caging. Open-ended cues close by an
  explicit `skip` ("done", "no"), keyed per task so a new job reopens them.
- One vocabulary, four verbs: **add · rename · remove · move**. A workflow step never has
  only `add` — a correction ("drop the pH", "rename it…", "move alk up") must reach the same
  list as an addition, or it lands as data. Steps normalize the human's words into a verb;
  `acts()` already knows which control each verb uses, so a verb is an animation for free.
  Target a named item exact → whole-word → loose, never plain `includes` ("delete ph" must
  not hit "Photos").
- The hand: everything Aludel writes onto the stage plays as visible edits under the violet
  touch-cursor — `acts()` diffs old→new into actions that each name the control they use, and
  `perform()` glides, taps, applies. The show is presentation only: the final snap sets the
  exact computed template, so playback can differ from the truth cosmetically, never
  materially. Input stays `busy` while the hand works so nobody edits under it.
- Auth is Cloudflare Access in front of the Worker (JWT verified in worker/auth.ts);
  the app has no login flow of its own. DEV_USER works only while ACCESS_AUD is unset.
- The look is one committed world (no theme switching, no second layout): in the office the
  app **is** the terminal — one jet-black slab whose title bar carries only the centred
  wordmark and a `[ ]` menu (the office/field switch and who you are live in it) — the slab
  runs edge to edge, no gutter and no page behind it, while the stage and the log keep a
  readable measure inside it — with the
  glass **stage** — the tool — docked inside it as a window that minimizes and maximizes,
  pinned above the conversation; the field keeps its solo glass sheet. No fake window
  ornaments in the chrome: no traffic lights, no corner glare — the app is not pretending
  to be a window, it is the window. Type is sized for a gloved thumb in daylight: nothing the
  crew reads is under ~0.8rem and nothing they tap is under ~40px — legibility outranks density. One arrangement at
  every width — a wide screen is the phone, wider. The stage-to-conversation split is always
  golden (1.618 : 1); the grip only chooses which side gets φ's long side. Never reuse a
  component's class name as a state modifier — `pane ${wide}` once painted the whole pane
  with the terminal's styling — and because the stage lives inside the terminal, terminal
  chrome selects children (`.term > form input`), never descendants, or it repaints the tool. Colour encodes provenance and nothing else — violet = a model wrote this,
  mint = the machine is certain (script, ledger, guard), white = you. Keep it true: never
  paint a model's words mint. Styling lives in `src/index.css` (uncounted by the LOC gate),
  so pay for polish there, not in TSX. No webfonts — the field runs offline.

Cloudflare setup (per developers.cloudflare.com/agent-setup): the vendored skills in
`.claude/skills/` (workers-best-practices, durable-objects, wrangler) are from
github.com/cloudflare/skills — load them before writing Worker/DO code or wrangler
config; prefer their retrieval guidance over pre-trained knowledge. `.mcp.json`
registers Cloudflare's docs/bindings/builds/observability MCP servers (the last three
need a `wrangler login` locally; some remote sessions block *.cloudflare.com egress).
