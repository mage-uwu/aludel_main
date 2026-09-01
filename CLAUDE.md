# Aludel

The spec is SPEC.md — four nouns, eight facts, eight laws. A form is not a noun: Template ×
Site is a form, so `dispatched` still carries the envelope but it flattens onto its entries —
an entry names its own site, pinned version and client meta, and there is no forms table to
join. A cadence says how often and how long; **which day is the site's** (`services[].day`),
because a template cannot know which weekday a route runs. Read it before touching
`src/` or `worker/`. Non-negotiables that are easy to lose:

- The app is ≤ 81,000 **characters** of TypeScript; `scripts/loc.sh` gates the build. Tests,
  CSS, and config are uncounted. It was a line budget until the count sat pinned at 800 for
  twenty-five commits while the source grew a third — lines price newlines, newlines are free,
  so it rewarded density and twice picked the cheaper-to-write design over the correct one.
  Characters price the thing itself, and remove the incentive to join statements at all. A
  400-char line cap is only a backstop against a schema crammed onto one line; JSX and prompts
  may run long. New code still pays for itself by trimming real fat, never by moving the line.
  The line moved once, 78,000 → 81,000, for hands-free voice: a WebRTC handshake and an
  ephemeral-key route are ~2,800 characters that cannot be written smaller, and the only fat
  left of that size was a feature. That is the bar — a **new capability the app could not
  otherwise have**, asked for and signed off by the owner, never a refactor that overran.
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
  (`OPENAI_MODEL`), never hardcoded — as is the ear's (`OPENAI_VOICE_MODEL`), and a missing
  one is a refusal that says so rather than a guessed default. Template changes go through typed tools only —
  `new_template` starts the interview, `edit_template` stages the next version (the worker
  owns version numbers, key slugs, and label hygiene; the model never hand-rolls a `signed`
  fact) — and the guard refuses any fact type outside the eight (`default:` is load-bearing;
  runtime JSON is not bound by our union). Staged drafts render as prose cards, never JSON.
  Aludel wears a **kaomoji on the line directly above the prompt**, with the state in words
  beside it — ready · thinking · building · presenting · error — and a small idle hop so the
  desk has a pulse. It replaced a status strip that announced a model number the app does not
  have. The face sits in a fixed-width column so the label never shifts under it.
  It is a mood, not a message: derived in CSS from the DOM the app already renders (a disabled
  prompt is thinking, a draft on the stage is presenting, both at once is the hand building, an
  error last in the log is an error), so the model never emits one and cannot lie about what it
  is doing. No colour on it — the glyphs carry the state and colour still means provenance.
  Committing is the human's act at the desk, so **Commit and Discard live in the terminal**, on
  a deck above the prompt — never on the stage: the stage is a preview of a phone screen and a
  phone screen has no button for signing off a template. The office is one shared tool with two operators:
  every `/api/agent` call carries the screen (`view: { tab, draft, drafts }`), so whatever
  is open to the human is open to the agent — and an agent edit to an open draft plays
  from that draft, never from the ledger, so it can't stomp the human's pencil work.
- The report is a **form for a gloved thumb in daylight**, and it is one system: a field is a
  label and a control, nothing more. Three nested boxes — sheet, job, field — is three borders
  saying nothing, so the report and the job are type and space and **the control is the only
  thing with edges, because it is the only thing you touch**. Labels are real words at 16px,
  never small-caps at 13: uppercase throws away the word shapes a glance runs on. Targets are
  sized for the thumb, not the mouse — 56px of input, 60px of decision, 104px of shutter, 44px
  floor on everything else. The outcomes are the biggest thing on the sheet and they are a
  **two-up grid of 82px slabs** — four of them is a 2x2 the thumb finds without looking — with
  the odd one out spanning the full width rather than leaving a hole. Spacing is one rhythm (`--y1/2/3`:
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
- **Voice is another keyboard, never a second agent.** `/api/voice` mints an ephemeral key so
  the browser can hold a microphone open to the realtime model and the worker's own key never
  leaves it. The GA endpoints are `POST /v1/realtime/client_secrets` (body
  `{session:{type:"realtime", model, output_modalities, audio:{input:{transcription, turn_detection}}}}`,
  answering with a top-level `value`) and `POST /v1/realtime/calls` for the SDP offer — a
  `?model=` on that one is a 400, because the session already carries it. The beta's
  `/realtime/sessions` and its flat `input_audio_transcription` are both gone; a test pins the
  shape so the next person reads it here instead of finding it in production. That session only ever listens — text out, no voice back, `create_response:false`,
  no turn of its own — because **Aludel speaks with his own mouth, not the ear's**: the browser
  reads aloud the exact line the terminal just printed, so the words spoken are the words the
  routine wrote and there is no second model with an opinion. The mic goes deaf for the length
  of an utterance, or he hears himself and answers his own question; and the line reaches the
  screen BEFORE the mouth, so a browser without SpeechSynthesis still gets the interview.
  Nothing is spoken unless the mic is on — and every finished sentence is **typed into the prompt and submitted
  from there**, never handed to `send()`: the data-channel handler binds once, so a captured
  `send()` would answer every sentence with the state the mic was switched on in and voice
  would never reach a cue at all. Going through the input also means a sentence heard while
  Aludel is busy waits in the box where the crew can see it, instead of vanishing. The turn
  detector gets `silence_duration_ms:1200`, because a tradesperson's "uh…" is not the end of a
  sentence and the default splits it into two. The routine, the guard and the commit are
  untouched. A model with a microphone and
  its own tools would be a second brain with a different surface; this one cannot say anything
  the crew did not.
- Cues ask about **this job only**. The client, address and phone belong to the site, never to
  its paperwork — the crew is never invited to type them into a form, and the normalizer is
  told so. Most jobs record one or two things; a cleaning is often just a photo.
- One vocabulary, four verbs: **add · rename · remove · move**. A workflow step never has
  only `add` — a correction ("drop the pH", "rename it…", "move alk up") must reach the same
  list as an addition, or it lands as data. Steps normalize the human's words into a verb;
  `acts()` already knows which control each verb uses, so a verb is an animation for free.
  Target a named item exact → whole-word → loose, never plain `includes` ("delete ph" must
  not hit "Photos").
- The hand is **two primitives, and everything composes from them**: **Aludel himself**, who
  walks to a control and presses it, and a blinking violet **caret** that types into what he
  pressed, letter by letter. He is not holding a mouse — he *is* the pointer, the same kaomoji
  the status line wears, in the same two poses it already defines: arms up (`building`) while
  he crosses the form, hands forward (`presenting`) on the press. One character, so the face at
  the prompt and the figure on the stage are the same creature and you watch him build the
  thing. He waves as he goes, stands just above whatever he is touching, and the ring blooms
  under his hands on the control itself. A halo the colour of the page keeps him legible on
  paper and on the slab in either skin. He carries no colour, because he is the machine's hand
  and not its voice. **The wave rides on `.hand::before`, never on `.hand`** — an animated
  `transform` outranks the inline one the press uses, which is the caret's blink trap again. It enters from below the stage
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
- The look is **one world in two skins**, following the device: `prefers-color-scheme` alone,
  no in-app switch — a phone in a basement and a phone in June are not the same screen, and the
  crew already told their OS which one they are holding. The whole world turns, not the chrome:
  a light terminal in daylight, a dark form at night. What carries the design is the
  **relationship**, never the absolute values — paper always sits a step brighter than the slab
  it lies on, every division is a hairline, and colour still means provenance. Depth is value,
  not colour and never a shadow: `--page → --slab → --paper → --raise` steps up, and a well
  (`--sunk`) steps **down**, because a recess reads by going darker than the surface it is cut
  into. In the light skin `--raise` is the same white as the paper and a hairline does the
  lifting; in the dark skin nothing lifts by a border alone, so it takes a real step. The dark
  ramp is cool, not neutral — flat grey is what makes a dark app look unfinished. Every colour is a
  token defined once in the two `:root` blocks at the top of `src/index.css`; **never write a
  literal below them** (the two `#000` in the `.log` mask are alpha, not colour, and the
  pointer's own black-with-a-white-edge is deliberately the same on both grounds). In the office the
  app **is** the terminal — one flat slab whose title bar carries only the centred
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
  backdrop blur, no gloss inset — every division on the screen is a hairline or plain space,
  because the only things that should carry weight are the words and the controls. The slab
  wears that hairline itself, or in the dark skin the page and the slab are both `#000` and its
  rounded corner disappears. The line above the prompt carries Aludel's face and what it is
  doing, not a serial number: a machine that larps at being hardware is the one ornament this
  app cannot afford. In the terminal grid **every child names its own row**, because once one
  is placed by hand the auto-flow cursor fights the explicit rows — the stage and the grip
  landed in the same cell and the log swallowed clicks. Two items given a definite row but no
  column do not stack either: the second opens an implicit **column**, and the whole terminal
  quietly became two columns wide on a phone. Type is sized for a gloved thumb in daylight: nothing the
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
  mint = the machine is certain (script, ledger, guard), the plain reading colour = you. Keep it true: never
  paint a model's words mint. Styling lives in `src/index.css` (uncounted by the LOC gate),
  so pay for polish there, not in TSX. No webfonts — the field runs offline.

Cloudflare setup (per developers.cloudflare.com/agent-setup): the vendored skills in
`.claude/skills/` (workers-best-practices, durable-objects, wrangler) are from
github.com/cloudflare/skills — load them before writing Worker/DO code or wrangler
config; prefer their retrieval guidance over pre-trained knowledge. `.mcp.json`
registers Cloudflare's docs/bindings/builds/observability MCP servers (the last three
need a `wrangler login` locally; some remote sessions block *.cloudflare.com egress).
