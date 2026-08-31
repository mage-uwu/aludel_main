# Aludel

Trades do repeating things, on a schedule, at a place, sometimes against a balance.
Aludel is the ledger of that work — one PWA with two modes. **Office** talks to the desk
(the agent) to author templates and dispatch work; **field** sees what's open, past due,
and logs each task once, with an outcome, even offline. The model is in [SPEC.md](SPEC.md):
five nouns, eight facts, eight laws, and every screen a pure reading of the ledger.

```
npm install
npm run dev          # standalone: this device is the ledger (Ledger tab → load the demo team)
npm test             # 13 tests drive the kernel through the guard, as the server does
npm run build        # typecheck (client + worker) — build gate includes scripts/loc.sh
npx wrangler deploy  # the full stack: Worker + one Durable Object per team + R2 + KV
```

## The 800-line law

The app is at most 800 lines of TypeScript — `scripts/loc.sh` fails the build past it.
Tests, CSS, and config are uncounted. Currently exactly 800:

| | file | lines | |
|---|---|---:|---|
| kernel | `src/kernel.ts` | 193 | five nouns, eight facts, guard, fold, four lenses, pure scheduler |
| reads | `src/read.ts` | 64 | `find`, `ask` (per-kind legality, denominators), `balance` |
| store | `src/sync.ts` | 90 | IndexedDB mirror + queue; offline work reconciles by union |
| field | `src/field.tsx` | 68 | past due / open / logged lists, the logger, photo capture |
| office | `src/office.tsx` | 84 | chat with the desk, draft cards, sites / templates / ledger |
| shell | `src/App.tsx` `src/main.tsx` `src/demo.ts` | 73 | modes, auth gates, demo team |
| server | `worker/do.ts` | 68 | the team DO: append through the guard, seq, pull, daily plan alarm |
| server | `worker/index.ts` `worker/auth.ts` | 112 | routes, founding, Google OIDC, blobs |
| agent | `worker/agent.ts` | 67 | Aludel, the desk (OpenAI, model id in config): find/ask mid-loop, drafts to a human tap |

## Deploying

Workers Builds deploys from git (`npm run build`, then `npx wrangler deploy`). Auth is
Cloudflare Access: enable Access on the Worker's workers.dev domain, copy the Access
application's audience tag into `ACCESS_AUD` in `wrangler.jsonc` (with `ACCESS_TEAM` as
your Zero Trust team slug), and manage who may enter in Zero Trust → Access →
Applications. Everyone verified shares the `alpha` team until the optional `DIR` KV
namespace is bound (uncomment in `wrangler.jsonc`) for multi-team; the optional R2 bucket
enables photo upload. `OPENAI_API_KEY` (secret) turns on Aludel, the desk; `OPENAI_MODEL` in `wrangler.jsonc` picks the model.

For local work, `DEV_USER` in `wrangler.jsonc` + `npx wrangler dev` — honored only while
`ACCESS_AUD` is unset. Without any server the app still runs whole: the same guard and
scheduler execute on the device, which is also what a phone in a basement does with the
queue until signal.
