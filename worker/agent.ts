import type { Payload } from "../src/kernel";
import type { Team } from "./do";
import type { Env } from "./index";

// Aludel, the desk. One agent, two roles: the oracle reads freely — find and ask run right
// here against the team's ledger — and the hand only drafts: a clean draft is staged for the
// human's tap; nothing is real until their commit appends it. The model is OpenAI's Responses
// API (reasoning models require it for function tools); conversation state lives server-side
// via previous_response_id, so each request carries only the new turn and a fresh team digest.
type Call = { type: "function_call"; call_id: string; name: string; arguments: string };
type Resp = { id: string; output: ({ type: string } & Record<string, unknown>)[] };

const TOOLS = [
  { type: "function", name: "find", description: "Look up entries (units of scheduled work). Rows carry status, window, and what was logged. Statuses: scheduled|pending|overdue|logged. list = the route the work is allocated to.", parameters: { type: "object", properties: { site: { type: "string" }, task: { type: "string" }, actor: { type: "string" }, status: { type: "string" }, list: { type: "string" }, from: { type: "number" }, to: { type: "number" } } } },
  { type: "function", name: "ask", description: "Aggregate one channel. channel is a block key or 'outcome'. Legal aggs — number: sum|avg|min|max|last; text: last|count; photo: count|presence; outcome: tally|cost. Answers carry value, n (entries recording it), of (entries in scope).", parameters: { type: "object", properties: { template: { type: "string" }, task: { type: "string" }, channel: { type: "string" }, agg: { type: "string" }, site: { type: "string" }, actor: { type: "string" }, from: { type: "number" }, to: { type: "number" } }, required: ["template", "task", "channel", "agg"] } },
  { type: "function", name: "new_template", description: "Start the structured new-report interview. Call this whenever the human wants to create a new report or template — do not interrogate them yourself.", parameters: { type: "object", properties: {} } },
  { type: "function", name: "draft", description: "Propose facts to append (declared|signed|bound|dispatched|granted|steered). They are checked and staged for the human, who commits or discards. Call once, complete, after your reads.", parameters: { type: "object", properties: { facts: { type: "array", items: { type: "object" } } }, required: ["facts"] } },
];

const digest = (t: Awaited<ReturnType<Team["snapshot"]>>) => JSON.stringify({ now: Date.now(), actors: Object.values(t.actors), sites: Object.values(t.sites),
  templates: Object.entries(t.latest).map(([id, v]) => t.templates[`${id}@${v}`]) });

const SYSTEM = `You are Aludel, the office desk of a trades team. Their world: a Site is a place with a client;
a Template (versioned) declares Tasks, each with typed blocks, outcomes, and a cadence; dispatching mints a
Form and its Entries; the field logs each entry once, with an outcome. Work is allocated by lists (routes):
a service binding's list and assignee flow onto every entry it mints, and steered re-routes one entry (due,
list, assignee) until it is logged. Answer questions with find/ask and cite what you read — say the numbers'
denominators out loud ("3 tabs across 1 of 4 visits"), never a bare figure. Make changes only via draft, and
keep drafts minimal and complete: new ids as short random strings; template edits are a whole new version with
the same task/block/outcome keys (never retype a key); windows and times are epoch ms. Labels are for humans —
words with spaces (Title Case; outcomes UPPERCASE), never underscores; only keys are snake_case slugs. To create
a new report or template, call new_template — never collect the details in chat; for anything else ambiguous,
ask back instead of guessing. The office is collaborative: the screen context shows the tab the human has open
and any uncommitted draft on the stage, including their hand edits — treat that draft as the working copy. To
change it, draft one signed fact reusing its id and version verbatim; your edit will play out on their stage
for their commit. Team state:\n`;

const oai = (env: Env, body: unknown) => fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: JSON.stringify(body) });
const textOf = (r: Resp) => r.output.filter((o) => o.type === "message").flatMap((m) => (m.content as { type: string; text?: string }[]) ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n");

// The interview's parser: the flow is deterministic, the model normalizes each answer into
// the step's JSON shape — "Yeah, we clean the cover" becomes {"title": "Cover Cleaning"}.
const SPECS: Record<string, string> = {
  title: '{"title": string} — short, Title Case.',
  task: '{"title": string} — a concise task name, Title Case, filler stripped ("Yeah, we clean the cover" → "Cover Cleaning").',
  outcomes: '{"labels": string[]} — the possible endings as short UPPERCASE labels, spaces between words, never underscores.',
  cadence: '{"every": number, "unit": "day"|"week"|"month"}, or {"every": null} if it does not repeat.',
  day: '{"day": number} — the weekday, 0 = Sunday.',
  blocks: '{"blocks": [{"kind": "photo"|"number"|"text", "label": string}]} — one per recorded item, kind inferred.',
};
export const refine = async (env: Env, body: { kind: string; text: string }): Promise<Response> => {
  const res = await oai(env, { model: env.OPENAI_MODEL, input: [{ role: "user", content: body.text }],
    instructions: `Normalize the tradesperson's words. Reply with ONLY this JSON: ${SPECS[body.kind] ?? SPECS.title}` });
  const raw = res.ok ? /\{[\s\S]*\}/.exec(textOf((await res.json()) as Resp))?.[0] : null;
  return new Response(raw ?? "null", { headers: { "Content-Type": "application/json" } });
};

export const chat = async (env: Env, team: DurableObjectStub<Team>, email: string, body: { text: string; previous?: string; view?: unknown }): Promise<Response> => {
  if (!env.OPENAI_API_KEY) return reply("No OPENAI_API_KEY reaches the worker. Add it under Settings → Variables and Secrets (the runtime section, not Build) on this worker, as a Secret, and deploy the change.", [], body.previous);
  if (!body.text) return reply("Your device is running an old cached version of the app — close the tab (or pull to refresh) and reopen, then ask again.", [], body.previous);
  const instructions = SYSTEM + digest(await team.snapshot()) + (body.view ? `\nThe human's screen right now (you share this tool; an open draft is the working copy, theirs and yours): ${JSON.stringify(body.view)}` : "");
  let input: unknown[] = [{ role: "user", content: body.text }];
  let previous = body.previous;
  let drafts: Payload[] = [];
  for (let turn = 0; turn < 8; turn++) {
    const res = await oai(env, { model: env.OPENAI_MODEL, instructions, tools: TOOLS, input, ...(previous && { previous_response_id: previous }) });
    if (!res.ok) return reply(`The model API refused (${res.status}): ${(await res.text()).slice(0, 300)}`, [], previous); // misconfiguration diagnoses itself in chat
    const r = (await res.json()) as Resp;
    previous = r.id;
    const calls = r.output.filter((o): o is Call => o.type === "function_call");
    const text = textOf(r);
    if (calls.length === 0) return reply(text || "Here's what I put together.", drafts, previous);
    input = []; // next request: only this turn's tool outputs; previous_response_id carries the rest
    for (const call of calls) {
      if (call.name === "new_template") return reply("Let's build it properly — quick questions, one at a time.", [], body.previous, true); // fork the thread from before the call
      const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      let result: unknown =
        call.name === "find" ? await team.find(args) :
        call.name === "ask" ? await team.ask(args as never) :
        await team.check(email, (args.facts ?? []) as Payload[]); // draft: dry-run the guard
      if (call.name === "draft" && (result as { refused: unknown[] }).refused.length === 0) {
        drafts = (args.facts ?? []) as Payload[]; // staged; the model gets told and says its closing line
        result = { staged: drafts.length, note: "presented to the human for commit" };
      }
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
  }
  return reply("I ran out of turns — try a smaller ask.", drafts, previous);
};

const reply = (text: string, drafts: Payload[], previous?: string, wizard?: boolean) =>
  new Response(JSON.stringify({ reply: text, drafts, previous, wizard }), { headers: { "Content-Type": "application/json" } });
