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
  { type: "function", name: "find", description: "Look up entries (units of scheduled work). Returns rows with status, window, and what was logged. Statuses: scheduled|pending|overdue|logged. list = the route/crew the work is allocated to.",
    parameters: { type: "object", properties: { site: { type: "string" }, task: { type: "string" }, actor: { type: "string" }, status: { type: "string" }, list: { type: "string" }, from: { type: "number" }, to: { type: "number" } } } },
  { type: "function", name: "ask", description: "Aggregate one channel of history. channel is a block key, or 'outcome'. Legal aggs — number: sum|avg|min|max|last; text: last|count; photo: count|presence; outcome: tally|cost. Answers carry value, n (entries that recorded it), of (entries in scope).",
    parameters: { type: "object", properties: { template: { type: "string" }, task: { type: "string" }, channel: { type: "string" }, agg: { type: "string" }, site: { type: "string" }, actor: { type: "string" }, from: { type: "number" }, to: { type: "number" } }, required: ["template", "task", "channel", "agg"] } },
  { type: "function", name: "draft", description: "Propose facts to append to the ledger (declared|signed|bound|dispatched|granted|steered). They are checked and staged for the human, who commits or discards them. Call once, with the complete set, after your reads.",
    parameters: { type: "object", properties: { facts: { type: "array", items: { type: "object" } } }, required: ["facts"] } },
];

const digest = (t: Awaited<ReturnType<Team["snapshot"]>>) => JSON.stringify({
  now: Date.now(),
  actors: Object.values(t.actors),
  sites: Object.values(t.sites),
  templates: Object.entries(t.latest).map(([id, v]) => t.templates[`${id}@${v}`]),
});

const SYSTEM = `You are Aludel, the office desk of a trades team. Their world: a Site is a place
with a client; a Template (versioned) declares Tasks, each with typed blocks, outcomes, and a
cadence; dispatching mints a Form and its Entries; the field logs each entry once, with an outcome.
Work is allocated by lists (routes): a service binding's list and assignee flow onto every
entry it mints, and steered re-routes one entry (due, list, assignee) until it is logged.
Answer questions with find/ask and cite what you read — say the numbers' denominators out loud
("3 tabs across 1 of 4 visits"), never a bare figure. Make changes only via draft, and keep
drafts minimal and complete: new ids as short random strings; template edits are a whole new
version with the same task/block/outcome keys (never retype a key); windows and times are epoch
ms. If the human's ask is ambiguous, ask back instead of guessing. Team state:\n`;

export const chat = async (env: Env, team: DurableObjectStub<Team>, email: string, body: { text: string; previous?: string }): Promise<Response> => {
  if (!env.OPENAI_API_KEY) return reply("No OPENAI_API_KEY reaches the worker. Add it under Settings → Variables and Secrets (the runtime section, not Build) on this worker, as a Secret, and deploy the change.", [], body.previous);
  if (!body.text) return reply("Your device is running an old cached version of the app — close the tab (or pull to refresh) and reopen, then ask again.", [], body.previous);
  const instructions = SYSTEM + digest(await team.snapshot());
  let input: unknown[] = [{ role: "user", content: body.text }];
  let previous = body.previous;
  let drafts: Payload[] = [];
  for (let turn = 0; turn < 8; turn++) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.OPENAI_MODEL, instructions, tools: TOOLS, input, ...(previous && { previous_response_id: previous }) }),
    });
    if (!res.ok) return reply(`The model API refused (${res.status}): ${(await res.text()).slice(0, 300)}`, [], previous); // misconfiguration diagnoses itself in chat
    const r = (await res.json()) as Resp;
    previous = r.id;
    const calls = r.output.filter((o): o is Call => o.type === "function_call");
    const text = r.output.filter((o) => o.type === "message")
      .flatMap((m) => (m.content as { type: string; text?: string }[]) ?? [])
      .filter((c) => c.type === "output_text").map((c) => c.text).join("\n");
    if (calls.length === 0) return reply(text || "Here's what I put together.", drafts, previous);
    input = []; // next request: only this turn's tool outputs; previous_response_id carries the rest
    for (const call of calls) {
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

const reply = (text: string, drafts: Payload[], previous?: string) =>
  new Response(JSON.stringify({ reply: text, drafts, previous }), { headers: { "Content-Type": "application/json" } });
