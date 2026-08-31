# Aludel

The spec is SPEC.md — five nouns, eight facts, eight laws. Read it before touching
`src/` or `worker/`. Non-negotiables that are easy to lose:

- The app is ≤ 800 lines of TypeScript; `scripts/loc.sh` gates the build. Tests, CSS,
  and config are uncounted. New code pays for itself by trimming real fat, never by
  moving the goalposts.
- Every write goes through `guard()`; every view is `f(ledger, now)`; task/block/outcome
  keys are minted once, never retyped, never reused.
- Field work is allocated and filtered by **lists** (routes/crews): a service binding's
  `list` and `assignee` flow onto every entry it mints, the `steered` fact re-routes one
  entry, and the field UI's chips filter by list. Allocation is writing a name on work.
- The agent is named Aludel. It drafts; a human's fact commits (`via: "agent"`). Its tool
  surface is the eight facts + `find` + `ask`, nothing else; its model id is config
  (`OPENAI_MODEL`), never hardcoded. The office is one shared tool with two operators:
  every `/api/agent` call carries the screen (`view: { tab, draft, drafts }`), so whatever
  is open to the human is open to the agent — and an agent edit to an open draft plays
  from that draft, never from the ledger, so it can't stomp the human's pencil work.
- One renderer for a block, everywhere: `Input` in `src/field.tsx`. The office preview and
  the field logger mount the very same control — `set` given makes it live, `set` omitted
  makes it a disabled preview — so what you build is literally what the crew taps. Never
  fork a second "preview" rendering of a block; add the affordance to `Input` instead.
- The hand: everything Aludel writes onto the stage plays as visible edits under the violet
  touch-cursor — `acts()` diffs old→new into actions that each name the control they use, and
  `perform()` glides, taps, applies. The show is presentation only: the final snap sets the
  exact computed template, so playback can differ from the truth cosmetically, never
  materially. Input stays `busy` while the hand works so nobody edits under it.
- Auth is Cloudflare Access in front of the Worker (JWT verified in worker/auth.ts);
  the app has no login flow of its own. DEV_USER works only while ACCESS_AUD is unset.
- The look is one committed world (no theme switching, no second layout): a glass **stage**
  over a black **terminal**, stacked at every width — a wide screen is the phone, wider. The
  split is always golden (1.618 : 1); the grip between the panes only chooses which one gets
  φ's long side. Never reuse a component's class name as a state modifier — `pane ${wide}`
  once painted the whole pane with the terminal's styling. Colour encodes provenance and nothing else — violet = a model wrote this,
  mint = the machine is certain (script, ledger, guard), white = you. Keep it true: never
  paint a model's words mint. Styling lives in `src/index.css` (uncounted by the LOC gate),
  so pay for polish there, not in TSX. No webfonts — the field runs offline.

Cloudflare setup (per developers.cloudflare.com/agent-setup): the vendored skills in
`.claude/skills/` (workers-best-practices, durable-objects, wrangler) are from
github.com/cloudflare/skills — load them before writing Worker/DO code or wrangler
config; prefer their retrieval guidance over pre-trained knowledge. `.mcp.json`
registers Cloudflare's docs/bindings/builds/observability MCP servers (the last three
need a `wrangler login` locally; some remote sessions block *.cloudflare.com egress).
