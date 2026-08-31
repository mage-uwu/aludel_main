import type { Payload, Task, Template, TemplateId } from "../src/kernel";
import type { Team } from "./do";
import type { Env } from "./index";

// Aludel, the desk. One agent, two roles: the oracle reads freely — find and ask run right
// here against the team's ledger — and the hand only drafts: a clean draft is staged for the
// human's tap; nothing is real until their commit appends it. The model is OpenAI's Responses
// API (reasoning models require it for function tools); conversation state lives server-side
// via previous_response_id, so each request carries only the new turn and a fresh team digest.
type Call = { type: "function_call"; call_id: string; name: string; arguments: string }; type Resp = { id: string; output: ({ type: string } & Record<string, unknown>)[] };

const TOOLS = [
  { type: "function", name: "find", description: "Look up entries (units of scheduled work). Rows carry status, window, and what was logged. Statuses: scheduled|pending|overdue|logged. list = the route the work is allocated to.", parameters: { type: "object", properties: { site: { type: "string" }, task: { type: "string" }, actor: { type: "string" }, status: { type: "string" }, list: { type: "string" }, from: { type: "number" }, to: { type: "number" } } } },
  { type: "function", name: "ask", description: "Aggregate one channel. channel is a block key or 'outcome'. Legal aggs — number: sum|avg|min|max|last; text: last|count; photo: count|presence; outcome: tally|cost. Answers carry value, n (entries recording it), of (entries in scope).", parameters: { type: "object", properties: { template: { type: "string" }, task: { type: "string" }, channel: { type: "string" }, agg: { type: "string" }, site: { type: "string" }, actor: { type: "string" }, from: { type: "number" }, to: { type: "number" } }, required: ["template", "task", "channel", "agg"] } },
  { type: "function", name: "new_template", description: "Start the structured interview — it asks one question at a time and builds on the human's screen. Call it with no id to create a new report; pass the id of an existing template to add a task to it. Call this the moment the human wants a new report or a new task — never collect names, fields, outcomes, or cadence in chat yourself.", parameters: { type: "object", properties: { id: { type: "string", description: "Existing template id to add a task to; omit for a brand-new report." } } } },
  { type: "function", name: "edit_template", description: "Change an existing template: add/remove/rename tasks, blocks, outcomes, or cadence. Pass the template id and the COMPLETE new task list (every task, changed or not — omissions are deletions). Reuse existing task/block/outcome keys verbatim; omit keys only on brand-new items. The office stages it as the next version and plays your edit on the human's stage, control by control, for their commit.", parameters: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, tasks: { type: "array", items: { type: "object", properties: { key: { type: "string" }, title: { type: "string" }, cadence: { type: "object", properties: { every: { type: "number" }, unit: { type: "string", enum: ["day", "week", "month"] }, withinDays: { type: "number" }, day: { type: "number" } }, required: ["every", "unit", "withinDays"] }, outcomes: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, cost: { type: "number" } }, required: ["label"] } }, blocks: { type: "array", items: { type: "object", properties: { key: { type: "string" }, kind: { type: "string", enum: ["text", "number", "photo", "button"] }, label: { type: "string" }, required: { type: "boolean" }, min: { type: "number" }, max: { type: "number" }, placeholder: { type: "string" } }, required: ["kind", "label"] } } }, required: ["title", "outcomes", "blocks"] } } }, required: ["id", "tasks"] } },
  { type: "function", name: "retire_template", description: "Retire a template so no new work is ever planned from it — the human's answer to 'delete this report'. Already-logged work is kept and still renders; nothing is erased. Staged for the human, who must type YES to confirm. Never use edit_template to empty a template instead.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { type: "function", name: "draft", description: "Propose facts to append (declared|bound|dispatched|granted|steered — NEVER signed; templates go through new_template or edit_template). They are checked and staged for the human, who commits or discards. Call once, complete, after your reads.", parameters: { type: "object", properties: { facts: { type: "array", items: { type: "object" } } }, required: ["facts"] } },
];
// The model speaks loosely; the office fills in what a hand-built task would have — slugged
// keys, spaced labels, block defaults — so a template arrives whole or not at all.
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x"; const nice = (x: string) => x.replace(/_+/g, " ").trim();
type Loose = { key?: string; title: string; cadence?: Task["cadence"]; outcomes: { key?: string; label: string; cost?: number }[]; blocks: { key?: string; kind: string; label: string; required?: boolean; min?: number; max?: number; placeholder?: string }[] };
const fix = (t: Loose): Task => ({ key: t.key || slug(t.title), title: nice(t.title), ...(t.cadence && { cadence: t.cadence }),
  outcomes: t.outcomes.map((o) => ({ key: o.key || slug(o.label), label: nice(o.label).toUpperCase(), cost: o.cost ?? (/no.?access|skip/i.test(o.label) ? 0 : 1) })),
  blocks: t.blocks.map((b) => (b.kind === "number" ? { key: b.key || slug(b.label), kind: "number", label: nice(b.label), required: !!b.required, min: b.min ?? 0, max: b.max ?? 999999 }
    : b.kind === "photo" ? { key: b.key || slug(b.label), kind: "photo", label: nice(b.label), required: !!b.required }
    : b.kind === "button" ? { key: b.key || slug(b.label), kind: "button", label: nice(b.label), action: "submit" }
    : { key: b.key || slug(b.label), kind: "text", label: nice(b.label), required: !!b.required, placeholder: b.placeholder ?? "" })) });

const digest = (t: Awaited<ReturnType<Team["snapshot"]>>) => JSON.stringify({ now: Date.now(), actors: Object.values(t.actors), sites: Object.values(t.sites), templates: Object.entries(t.latest).map(([id, v]) => t.templates[`${id}@${v}`]) });

const SYSTEM = `You are Aludel, the office desk of a trades team. Their world: a Site is a place with a client;
a Template (versioned) declares Tasks, each with typed blocks, outcomes, and a cadence; dispatching mints a
Form and its Entries; the field logs each entry once, with an outcome. Work is allocated by lists (routes):
a service binding's list and assignee flow onto every entry it mints, and steered re-routes one entry (due,
list, assignee) until it is logged. Answer questions with find/ask and cite what you read — say the numbers'
denominators out loud ("3 tabs across 1 of 4 visits"), never a bare figure. Make changes only through your
tools: edit_template for any change to an existing template (never build signed facts yourself), retire_template
to delete/retire one (never empty it out with edit_template instead), draft for the rest, minimal and complete: new ids as short random strings; windows and times are epoch ms. Labels are for humans —
words with spaces (Title Case; outcomes UPPERCASE), never underscores; only keys are snake_case slugs. To create
a new report, template, or task, call new_template — never collect the details in chat; use edit_template only
for direct, fully-specified changes ("rename X", "make Y required", "remove Z"). Speak plainly to tradespeople:
short sentences, ONE question per turn, never a compound question. If several templates could hold a new task,
ask ONLY which one — nothing else; with one template there is nothing to ask, call the tool. NEVER ask for a
title, fields, outcomes, or cadence: the interview collects those one at a time on the stage. The office is collaborative: the screen context shows the tab the human has open
and any uncommitted draft on the stage, including their hand edits — treat that draft as the working copy. To
change it, draft one signed fact reusing its id and version verbatim; your edit will play out on their stage
for their commit. Team state:\n`;

const oai = (env: Env, body: unknown) => fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: JSON.stringify(body) });
const textOf = (r: Resp) => r.output.filter((o) => o.type === "message").flatMap((m) => (m.content as { type: string; text?: string }[]) ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n");

// The interview's parser: the flow is deterministic, the model normalizes each answer into
// the step's JSON shape — "Yeah, we clean the cover" becomes {"title": "Cover Cleaning"}.
const SPECS: Record<string, string> = { title: '{"title": string} — short, Title Case.',
  task: '{"title": string} — a concise task name, Title Case, filler stripped ("Yeah, we clean the cover" → "Cover Cleaning").',
  outcomes: '{"labels": string[]} — the possible endings as short UPPERCASE labels, spaces between words, never underscores.',
  cadence: '{"every": number, "unit": "day"|"week"|"month"}, or {"every": null} if it does not repeat.',
  day: '{"day": number} — the weekday, 0 = Sunday.',
  blocks: '{"op":"add","blocks":[{"kind":"photo"|"number"|"text","label":string}]} — one entry per thing recorded, kind inferred.',
};
// Any cue may be answered with a correction instead. The verbs are the same everywhere.
const OPS = ' The text may not answer the question at all — if it corrects, inserts, or moves on, reply with ONE op instead: {"op":"remove","target":string} · {"op":"rename","target":string,"to":string} (omit target to rename the task itself, e.g. "rename it to Assessment") · {"op":"move","target":string,"by":-1|1} · {"op":"add","blocks":[{"kind":"photo"|"number"|"text","label":string}]} · {"op":"task","title":string} when they move on to a different job ("next: filter cleaning") · {"op":"skip"} for done/no/none. A correction is never an answer.';
export const refine = async (env: Env, body: { kind: string; text: string }): Promise<Response> => {
  const res = await oai(env, { model: env.OPENAI_MODEL, input: [{ role: "user", content: body.text }], instructions: `Normalize the tradesperson's words. Reply with ONLY this JSON: ${SPECS[body.kind] ?? SPECS.title}${OPS}` });
  const raw = res.ok ? /\{[\s\S]*\}/.exec(textOf((await res.json()) as Resp))?.[0] : null;
  return new Response(raw ?? "null", { headers: { "Content-Type": "application/json" } }); };

export const chat = async (env: Env, team: DurableObjectStub<Team>, email: string, body: { text: string; previous?: string; view?: unknown }): Promise<Response> => {
  if (!env.OPENAI_API_KEY) return reply("No OPENAI_API_KEY reaches the worker. Add it under Settings → Variables and Secrets (the runtime section, not Build) on this worker, as a Secret, and deploy the change.", [], body.previous);
  if (!body.text) return reply("Your device is running an old cached version of the app — close the tab (or pull to refresh) and reopen, then ask again.", [], body.previous);
  const snap = await team.snapshot(); const instructions = SYSTEM + digest(snap) + (body.view ? `\nThe human's screen right now (you share this tool; an open draft is the working copy, theirs and yours): ${JSON.stringify(body.view)}` : "");
  let input: unknown[] = [{ role: "user", content: body.text }]; let previous = body.previous; let drafts: Payload[] = [];
  for (let turn = 0; turn < 8; turn++) {
    const res = await oai(env, { model: env.OPENAI_MODEL, instructions, tools: TOOLS, input, ...(previous && { previous_response_id: previous }) });
    if (!res.ok) return reply(`The model API refused (${res.status}): ${(await res.text()).slice(0, 300)}`, [], previous);
    const r = (await res.json()) as Resp; previous = r.id;
    const calls = r.output.filter((o): o is Call => o.type === "function_call"); const text = textOf(r);
    if (calls.length === 0) return reply(text || "Here's what I put together.", drafts, previous);
    input = []; for (const call of calls) { // next request: only this turn's tool outputs; previous_response_id carries the rest
      const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      if (call.name === "new_template") return reply("One question at a time — watch the stage.", [], body.previous, (args.id as string) || true); // fork the thread from before the call
      const id = args.id as TemplateId, head = snap.latest[id] ?? 0; // version and name come from the ledger, never the model
      const prior = snap.templates[`${id}@${head}`];
      const facts: Payload[] = call.name === "edit_template"
        ? [{ type: "signed", template: { id, version: head + 1, name: nice((args.name as string) ?? prior?.name ?? ""), tasks: (args.tasks as Loose[]).map(fix) } as Template }]
        : call.name === "retire_template" ? (prior ? [{ type: "signed", template: { ...prior, version: head + 1, retired: true } }] : [])
        : ((args.facts ?? []) as Payload[]);
      let result: unknown =
        call.name === "find" ? await team.find(args) :
        call.name === "ask" ? await team.ask(args as never) :
        await team.check(email, facts); // draft, edit_template and retire_template: dry-run the guard
      if (call.name !== "find" && call.name !== "ask" && facts.length && (result as { refused: unknown[] }).refused.length === 0) {
        drafts = facts; // staged; the model gets told and says its closing line
        result = { staged: drafts.length, note: call.name === "edit_template" ? "playing on the human's stage for commit" : call.name === "retire_template" ? "staged; tell them it awaits their typed YES" : "presented to the human for commit" };
      }
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
  }
  return reply("I ran out of turns — try a smaller ask.", drafts, previous);
};

const reply = (text: string, drafts: Payload[], previous?: string, wizard?: boolean | string) => new Response(JSON.stringify({ reply: text, drafts, previous, wizard }), { headers: { "Content-Type": "application/json" } });
