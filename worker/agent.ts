import type { Payload, Task, Template, TemplateId } from "../src/kernel";
import type { Team } from "./do";
import type { Env } from "./index";

// Aludel, the desk. One agent, two roles: the oracle reads freely — find and ask run right
// here against the team's ledger — and the hand only drafts: a clean draft is staged for the
// human's tap; nothing is real until their commit appends it. The model is OpenAI's Responses
// API (reasoning models require it for function tools); conversation state lives server-side
// via previous_response_id, so each request carries only the new turn and a fresh team digest.
type Call = { type: "function_call"; call_id: string; name: string; arguments: string }; type Resp = { id: string; output: ({ type: string } & Record<string, unknown>)[] };

const fn = (name: string, description: string, properties: object, required: string[] = []) =>
  ({ type: "function", name, description, parameters: { type: "object", properties, required } });
const STR = { type: "string" }, NUM = { type: "number" }, BOOL = { type: "boolean" };
const TASK_SHAPE = { type: "object", required: ["title", "outcomes", "blocks"], properties: {
  key: STR, title: STR,
  cadence: { type: "object", required: ["every", "unit", "withinDays"],
    properties: { every: NUM, unit: { type: "string", enum: ["day", "week", "month"] }, withinDays: NUM } },  /* never a day: that is the site's */
  outcomes: { type: "array", items: { type: "object", required: ["label"], properties: { key: STR, label: STR, cost: NUM } } },
  blocks: { type: "array", items: { type: "object", required: ["kind", "label"], properties: {
    key: STR, kind: { type: "string", enum: ["text", "number", "photo", "button"] }, label: STR, required: BOOL, min: NUM, max: NUM, placeholder: STR } } },
} };

const TOOLS = [
  fn("find", "Look up entries (units of scheduled work). Rows carry status, window, and what was logged. "
    + "Statuses: scheduled|pending|overdue|logged. list = the route the work is allocated to.",
    { site: STR, task: STR, actor: STR, status: STR, list: STR, from: NUM, to: NUM }),
  fn("ask", "Aggregate one channel. channel is a block key or 'outcome'. Legal aggs — number: sum|avg|min|max|last; "
    + "text: last|count; photo: count|presence; outcome: tally|cost. Answers carry value, n (entries recording it), of (entries in scope).",
    { template: STR, task: STR, channel: STR, agg: STR, site: STR, actor: STR, from: NUM, to: NUM },
    ["template", "task", "channel", "agg"]),
  fn("new_template", "Start the structured interview — one question at a time, building on the human's screen. "
    + "No id creates a report; an id adds a job to that template. Call it the moment they want either — "
    + "never collect fields, outcomes or cadence in chat yourself.",
    { id: { type: "string", description: "Existing template id to add a job to; omit for a brand-new report." },
      named: { type: "string", description: "What they already called it, Title Case — the job's name with an id ('a new section: cover cleaning' -> 'Cover Cleaning'), the report's name without. Omit only if they did not say it." } }),
  fn("edit_template", "Change an existing template: add/remove/rename jobs, blocks, outcomes, or cadence. "
    + "Pass the template id and the COMPLETE new task list (every job, changed or not — omissions are deletions). "
    + "Reuse existing task/block/outcome keys verbatim; omit keys only on brand-new items. "
    + "The office stages it as the next version and plays your edit on the human's stage, control by control, for their commit.",
    { id: STR, name: STR, tasks: { type: "array", items: TASK_SHAPE } }, ["id", "tasks"]),
  fn("retire_template", "Retire a template so no new work is ever planned from it — the human's answer to 'delete this report'. "
    + "Already-logged work is kept and still renders; nothing is erased. Staged for the human, who must type YES to confirm. "
    + "Never use edit_template to empty a template instead.", { id: STR }, ["id"]),
  fn("draft", "Propose facts to append (declared|bound|dispatched|granted|steered — NEVER signed; templates go through "
    + "new_template or edit_template). They are checked and staged for the human, who commits or discards. "
    + "Call once, complete, after your reads.", { facts: { type: "array", items: { type: "object" } } }, ["facts"]),
];
// The model speaks loosely; the office fills in what a hand-built task would have — slugged
// keys, spaced labels, block defaults — so a template arrives whole or not at all.
const slug = (x: string) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x"; const nice = (x: string) => String(x ?? "").replace(/_+/g, " ").trim();
type Loose = { key?: string; title: string; cadence?: Task["cadence"]; outcomes: { key?: string; label: string; cost?: number }[]; blocks: { key?: string; kind: string; label: string; required?: boolean; min?: number; max?: number; placeholder?: string }[] };
const fix = (t: Loose): Task => ({ key: t.key || slug(t.title), title: nice(t.title), ...(t.cadence && { cadence: t.cadence }),
  outcomes: (t.outcomes ?? []).map((o) => ({ key: o.key || slug(o.label), label: nice(o.label).toUpperCase(), cost: o.cost ?? (/no.?access|skip/i.test(o.label) ? 0 : 1) })),
  blocks: (t.blocks ?? []).map((b) => (b.kind === "number" ? { key: b.key || slug(b.label), kind: "number", label: nice(b.label), required: !!b.required, min: b.min ?? 0, max: b.max ?? 999999 }
    : b.kind === "photo" ? { key: b.key || slug(b.label), kind: "photo", label: nice(b.label), required: !!b.required }
    : b.kind === "button" ? { key: b.key || slug(b.label), kind: "button", label: nice(b.label), action: "submit" }
    : { key: b.key || slug(b.label), kind: "text", label: nice(b.label), required: !!b.required, placeholder: b.placeholder ?? "" })) });

const digest = (t: Awaited<ReturnType<Team["snapshot"]>>) => JSON.stringify({ now: Date.now(), actors: Object.values(t.actors), sites: Object.values(t.sites), templates: Object.entries(t.latest).map(([id, v]) => t.templates[`${id}@${v}`]) });

const SYSTEM = `You are Aludel, the office desk of a trades team. Their world: a Site is a place with a client;
a Template (versioned) declares Tasks, each with typed blocks, outcomes, and a cadence; dispatching mints
Entries; the field logs each entry once, with an outcome. Work is allocated by lists (routes):
a service binding's list and assignee flow onto every entry it mints, and steered re-routes one entry (due,
list, assignee) until it is logged. Answer questions with find/ask and cite what you read — say the numbers'
denominators out loud ("3 tabs across 1 of 4 visits"), never a bare figure. Change nothing except through your
tools, and never build a signed fact yourself: new_template for a new report or a new job, edit_template for a
direct fully-specified change to an existing one ("rename X", "make Y required", "remove Z"), retire_template to
delete one, draft for the rest, minimal and complete: new ids as short random strings; windows and times are
epoch ms. Labels are for humans — words with spaces (Title Case; outcomes UPPERCASE), never underscores; only
keys are snake_case slugs. Speak plainly to tradespeople: short sentences, ONE question per turn, never a
compound question. If several templates could hold a new task, ask ONLY which one — nothing else; with one
template there is nothing to ask, call the tool. NEVER ask for a title, fields, outcomes, or cadence: the
interview collects those one at a time on the stage, except a name they already said, which goes to
new_template as 'named' — the one thing worse than asking is asking for what they just told you. The office is collaborative: the screen context shows the tab the human has open
and any uncommitted draft on the stage, including their hand edits — treat that draft as the working copy. To
change it, draft one signed fact reusing its id and version verbatim; your edit will play out on their stage
for their commit. Team state:\n`;

const oai = (env: Env, body: unknown) => fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: JSON.stringify(body) });
const textOf = (r: Resp) => r.output.filter((o) => o.type === "message").flatMap((m) => (m.content as { type: string; text?: string }[]) ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n");

// The interview's parser: the flow is deterministic, the model normalizes each answer into
// the step's JSON shape — "Yeah, we clean the cover" becomes {"title": "Cover Cleaning"}.
const SPECS: Record<string, string> = {
  title: '{"title": string} — short, Title Case.',
  task: '{"title": string} — a concise job name, Title Case, filler stripped ("Yeah, we clean the cover" → "Cover Cleaning").',
  outcomes: '{"labels": string[]} — the ways the job can end, as short UPPERCASE labels, spaces between words, never underscores.',
  cadence: '{"every": number, "unit": "day"|"week"|"month"}, or {"every": null} if it does not repeat.',
  days: '{"days": number} — how many days the crew has once the job comes up.',
  blocks: '{"blocks": [{"kind": "photo"|"number"|"text", "label": string}]} — ONLY what the crew records while doing this one job, one entry each, kind inferred. '
    + 'Most jobs need one or two; a cleaning is often just a photo. Never invent fields they did not name, never add a catch-all "notes", and never add site facts — '
    + 'the client, address, phone and email belong to the site, not to its paperwork. If they name nothing, return {"op":"skip"}.',
};

// Any cue may be answered with a correction instead of an answer. The verbs are the same everywhere.
const OPS = [
  ' The text may not answer the question at all. If it corrects, inserts, or moves on, reply with ONE op instead:',
  ' {"op":"remove","target":string} ·',
  ' {"op":"rename","target":string,"to":string} — omit target to rename the job itself ("rename it to Assessment") ·',
  ' {"op":"move","target":string,"by":-1|1} ·',
  ' {"op":"add","blocks":[{"kind":"photo"|"number"|"text","label":string}]} ·',
  ' {"op":"task","title":string} when they move on to a different job ("next: filter cleaning") ·',
  ' {"op":"skip"} for done / no / none / nothing.',
  ' A correction is never an answer.',
].join("");

export const refine = async (env: Env, body: { kind: string; text: string }): Promise<Response> => {
  const res = await oai(env, { model: env.OPENAI_MODEL, input: [{ role: "user", content: body.text }], instructions: `Normalize the tradesperson's words. Reply with ONLY this JSON: ${SPECS[body.kind] ?? SPECS.title}${OPS}` });
  const raw = res.ok ? /\{[\s\S]*\}/.exec(textOf((await res.json()) as Resp))?.[0] : null;
  return new Response(raw ?? "null", { headers: { "Content-Type": "application/json" } }); };

export const chat = async (env: Env, team: DurableObjectStub<Team>, email: string, body: { text: string; previous?: string; view?: unknown }): Promise<Response> => {
  if (!env.OPENAI_API_KEY) return reply("No OPENAI_API_KEY reaches the worker — add it as a Secret under Settings → Variables (runtime, not Build), then deploy.", [], body.previous);
  if (!body.text) return reply("Your device is running an old cached version of the app — close the tab (or pull to refresh) and reopen, then ask again.", [], body.previous);
  const snap = await team.snapshot();
  const instructions = SYSTEM + digest(snap) + (body.view ? `\nThe human's screen right now (you share this tool; an open draft is the working copy, theirs and yours): ${JSON.stringify(body.view)}` : "");
  let input: unknown[] = [{ role: "user", content: body.text }]; let previous = body.previous; let drafts: Payload[] = [];
  for (let turn = 0; turn < 8; turn++) {
    const res = await oai(env, { model: env.OPENAI_MODEL, instructions, tools: TOOLS, input, ...(previous && { previous_response_id: previous }) });
    if (!res.ok) return reply(`The model API refused (${res.status}): ${(await res.text()).slice(0, 300)}`, [], previous);
    const r = (await res.json()) as Resp; previous = r.id;
    const calls = r.output.filter((o): o is Call => o.type === "function_call"); const text = textOf(r);
    if (calls.length === 0) return reply(text || "Here's what I put together.", drafts, previous);
    input = []; for (const call of calls) { // next request: only this turn's tool outputs; previous_response_id carries the rest
      let args: Record<string, unknown> = {}; try { args = JSON.parse(call.arguments || "{}"); } catch { /* bad JSON from the model is a refusal, not a crash */ }
      if (call.name === "new_template") return reply("One question at a time — watch the stage.", [], body.previous, (args.id as string) || true, nice(args.named as string) || undefined); // fork the thread from before the call
      const id = args.id as TemplateId, head = snap.latest[id] ?? 0; // version and name come from the ledger, never the model
      const prior = snap.templates[`${id}@${head}`];
      const facts: Payload[] = call.name === "edit_template"
        ? [{ type: "signed", template: { id, version: head + 1, name: nice((args.name as string) ?? prior?.name ?? ""), tasks: ((args.tasks ?? []) as Loose[]).map(fix) } as Template }]
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

const reply = (text: string, drafts: Payload[], previous?: string, wizard?: boolean | string, named?: string) => new Response(JSON.stringify({ reply: text, drafts, previous, wizard, named }), { headers: { "Content-Type": "application/json" } });
