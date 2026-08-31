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
- The agent drafts; a human's fact commits (`via: "agent"`). The agent's tool surface is
  the eight facts + `find` + `ask`, nothing else.

Cloudflare setup (per developers.cloudflare.com/agent-setup): the vendored skills in
`.claude/skills/` (workers-best-practices, durable-objects, wrangler) are from
github.com/cloudflare/skills — load them before writing Worker/DO code or wrangler
config; prefer their retrieval guidance over pre-trained knowledge. `.mcp.json`
registers Cloudflare's docs/bindings/builds/observability MCP servers (the last three
need a `wrangler login` locally; some remote sessions block *.cloudflare.com egress).
