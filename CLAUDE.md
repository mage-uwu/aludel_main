# Aludel

The spec is SPEC.md — four nouns, eight facts, eight laws. A form is not a noun: Template ×
Site is a form, so `dispatched` still carries the envelope but it flattens onto its entries —
an entry names its own site, pinned version and client meta, and there is no forms table to
join. A cadence says how often and how long; **which day is the site's** (`services[].day`),
because a template cannot know which weekday a route runs. Read it before touching
`src/` or `worker/`. Non-negotiables that are easy to lose:

- The app is ≤ 78,000 **characters** of TypeScript; `scripts/loc.sh` gates the build. Tests,
  CSS, and config are uncounted. It was a line budget until the count sat pinned at 800 for
  twenty-five commits while the source grew a third — lines price newlines, newlines are free,
  so it rewarded density and twice picked the cheaper-to-write design over the correct one.
  Characters price the thing itself, and remove the incentive to join statements at all. A
  400-char line cap is only a backstop against a schema crammed onto one line; JSX and prompts
  may run long. New code still pays for itself by trimming real fat, never by moving the line.
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
- The report is a **form for a gloved thumb in daylight**, and it is one system: a field is a
  label and a control, nothing more. Three nested boxes — sheet, job, field — is three borders
  saying nothing, so the report and the job are type and space and **the control is the only
  thing with edges, because it is the only thing you touch**. Labels are real words at 16px,
  never small-caps at 13: uppercase throws away the word shapes a glance runs on. Targets are
  sized for the thumb, not the mouse — 56px of input, 60px of decision, 104px of shutter, 44px
  floor on everything else — and the outcome buttons run one to a row, because a mis-tap there
  writes the wrong outcome to a ledger that never forgets. Spacing is one rhythm (`--y1/2/3`:
  label to control, field to field, job to job), never a value typed twice.
- One renderer for a block, everywhere: `Input` in `src/field.tsx`. The office preview and
  the field logger mount the very same control — `set` given makes it live, `set` omitted
  makes it a disabled preview — so what you build is literally what the crew taps. Never
  fork a second "preview" rendering of a block; add the affordance to `Input` instead.
- A routine is a **branched checklist of cues, not a program counter**: each cue declares when
  it is still unfulfilled (`need(draft)`) and only asks then, so a branch is just a need that
  stays false down the road not taken — decline the repeat and how-often/what-day/how-many-days
  never fire. The next question is always the first unanswered cue. Any cue accepts an **op**
  instead of an answer — a correction re-routes and the cue stays pending — so order guides
  without caging. Open-ended cues close by an explicit `skip` ("done", "no", "none"), keyed to
  the job they asked about. `K(draft)` is the first job still missing an essential, never just
  the newest, so moving on cannot strand an unfinished one for the guard to refuse. And **never
  ask for what they just said**: a name carried in on the request that starts the interview ("a
  new section: cover cleaning") arrives as `new_template`'s `named` and answers the cue before it
  can fire. Reading the sentence is the model's job, never a regex in the client — which is why
  there is no client-side shortcut for starting one. A shortcut is exactly the thing that hears
  "new task" and throws the rest of the sentence away.
- Cues ask about **this job only**. The client, address and phone belong to the site, never to
  its paperwork — the crew is never invited to type them into a form, and the normalizer is
  told so. Most jobs record one or two things; a cleaning is often just a photo.
- One vocabulary, four verbs: **add · rename · remove · move**. A workflow step never has
  only `add` — a correction ("drop the pH", "rename it…", "move alk up") must reach the same
  list as an addition, or it lands as data. Steps normalize the human's words into a verb;
  `acts()` already knows which control each verb uses, so a verb is an animation for free.
  Target a named item exact → whole-word → loose, never plain `includes` ("delete ph" must
  not hit "Photos").
- The hand is **two primitives, and everything composes from them**: a black-and-white
  **pointer** that drives to a control and presses it, and a blinking violet **caret**
  that types into what it pressed, letter by letter. The pointer is the system arrow — one
  smooth path, black fill with a white edge and a soft shadow so it reads on the form's white
  and the terminal's black alike — and it is drawn at a real pointer's size, ~26px, never
  scaled up into a prop: the eye follows a cursor because it moves, not because it is large.
  It carries no colour, because it is the machine's hand and not its voice. It enters from below the stage
  once and then **stays** — a person does not put the mouse away between two edits, and the
  chain of moves is what makes it read as one mind working; only the routine ending sends it
  home. Motion is driven frame by frame, never CSS-tweened: a far target takes longer than a
  near one, the path bows sideways instead of ruling a diagonal, and it eases in and out with
  a beat of aim before the click. A selector that misses falls back to the job it belongs to,
  never to the whole card — flying to the wrong place reads as a machine, not a hand. `acts()` diffs old→new into actions that each name the control
  they use; an action carrying `text` is a typing act, and its `go(draft, partial)` takes the
  partial string so the letters can actually arrive one at a time. Adding a field presses
  `+ field` and then names it, the way a person would. Both primitives only need a position,
  so any future surface borrows the same show. The show is presentation only: the final snap
  sets the exact computed template, so playback can differ from the truth cosmetically, never
  materially. Input stays `busy` while the hand works so nobody edits under it, and
  `prefers-reduced-motion` skips straight to the result.
- Never blink a caret by animating `opacity` — an animated property outranks the inline style
  that shows and hides it, and it will sit there blinking at 0,0 forever. Blink the colour.
- Auth is Cloudflare Access in front of the Worker (JWT verified in worker/auth.ts);
  the app has no login flow of its own. DEV_USER works only while ACCESS_AUD is unset.
- The look is one committed world (no theme switching, no second palette): in the office the
  app **is** the terminal — one flat black slab whose title bar carries only the centred
  wordmark and a `[ ]` menu (the office/field switch and who you are live in it) — the slab
  takes the whole page bar a hair of white margin, just enough that its rounded corners read
  as a screen sitting on a desk — with the white **stage** — the tool — docked inside it as a
  window that minimizes; the field is the same white sheet, alone on the page. The tool is a
  preview of a phone screen, so it is **always drawn at a phone's size**: what the crew taps
  is never rendered wider than the thing they will tap it on. That gives the app its **two
  arrangements, one per device class, and there are only ever two**. On a phone (under 900px)
  the tool is on top at full width, the conversation under it, the prompt at the foot, and the
  stage-to-conversation split is golden — the grip chooses which side gets φ's long side and
  **maximise** gives the tool the screen with the conversation kept to a few lines. Past 900px
  it is a **workstation**: the conversation takes the left column and the tool stands in a
  column of its own on the **right**, wearing a handset's bezel. The column is the point — with
  the full height of the slab rather than a share of it, the ratio (9:19.5, width driven off
  the height, floored at 360px and capped at 480px) comes out true at every desktop size
  instead of squat. There is nothing to maximise into there, so that button is hidden rather
  than left to lie, and the grip goes with it; minimise still docks the tool to a bar. No fake window
  ornaments in the chrome: no traffic lights, no corner glare — the app is not pretending
  to be a window, it is the window. The session speaks in **sigils, not captions** — `$` for
  what you typed, `#` for what the machine or the model said, `✓` for the ledger — because a
  shell prompts, it does not label who is talking; colour still carries provenance. Nothing is
  textured, lit, or frosted: no scanlines, no vignette, no gradient mesh, no grain, no
  backdrop blur, no gloss inset — black is `#000`, paper is `#fff`, and every division on the
  screen is a hairline or plain space, because the only things that should carry weight are
  the words and the controls. The terminal signs itself in a status strip at the foot. Type is sized for a gloved thumb in daylight: nothing the
  crew reads is under ~0.8rem and nothing they tap is under ~40px — legibility outranks density.
  Two arrangements, never three: a third breakpoint is a layout nobody can hold in their head.
  The shell is sized from the **visual viewport** (`--vvh`, published by the script in
  `index.html`), never `dvh` — `dvh` slides with the browser's own chrome and reflows the whole
  app mid-scroll, and on iOS the layout viewport does not shrink for the keyboard at all, so
  Safari scrolls the page to reveal the focused field and the slab jitters. The document itself
  never scrolls or bounces (`body` is fixed, `html`/`body` `overflow:hidden`); only `.log` and
  `.scroll` do. Two rules keep that true: hold the last unzoomed height, because a zoomed visual
  viewport reports fewer CSS pixels and the app would shrink every time iOS auto-zoomed; and
  **nothing a phone can focus may be under 16px**, because that auto-zoom is itself the jitter.
  A keyboard leaves ~380px of app, and a golden split of that is two useless slivers, so while
  one is up (`html[data-keys]`, the gap between layout and visual viewport) the phone **sheds
  its ornament** — the wordmark bar, the grip, the signature, ~80px of the ~240 left to divide.
  Collapse those to zero height, never `display:none`: `.top` and `.grip` are auto-placed, so
  removing one shifts every item after it up a grid track and the prompt inherits the
  conversation's `1fr`.
  Never reuse a
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
