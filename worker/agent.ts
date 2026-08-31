import type { Payload } from "../src/kernel";
import type { Team } from "./do";
import type { Env } from "./index";

// Aludel, the desk. One agent, two roles: the oracle reads freely — find and ask run right
// here against the team's ledger — and the hand only drafts: a clean draft ends the turn and
// goes back to the client as a preview card. Nothing is real until a human's tap appends it.
// The model is OpenAI, spoken to over plain fetch; the id lives in config, not code.
type Call = { id: string; function: { name: string; arguments: string } };
type Msg = { role: string; content: string | null; tool_calls?: Call[]; tool_call_id?: string };

const TOOLS = [
  { type: "function", function: { name: "find", description: "Look up entries (units of scheduled work). Returns rows with status, window, and what was logged. Statuses: scheduled|pending|overdue|logged. list = the route/crew the work is allocated to.",
    parameters: { type: "object", properties: { site: { type: "string" }, task: { type: "string" }, actor: { type: "string" }, status: { type: "string" }, list: { type: "string" }, from: { type: "number" }, to: { type: "number" } } } } },
  { type: "function", function: { name: "ask", description: "Aggregate one channel of history. channel is a block key, or 'outcome'. Legal aggs — number: sum|avg|min|max|last; text: last|count; photo: count|presence; outcome: tally|cost. Answers carry value, n (entries that recorded it), of (entries in scope).",
    parameters: { type: "object", properties: { template: { type: "string" }, task: { type: "string" }, channel: { type: "string" }, agg: { type: "string" }, site: { type: "string" }, actor: { type: "string" }, from: { type: "number" }, to: { type: "number" } }, required: ["template", "task", "channel", "agg"] } } },
  { type: "function", function: { name: "draft", description: "Propose facts to append to the ledger (declared|signed|bound|dispatched|granted|steered). They are checked, then shown to the human, who commits or discards them. Call once, with the complete set, after your reads.",
    parameters: { type: "object", properties: { facts: { type: "array", items: { type: "object" } } }, required: ["facts"] } } },
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

export const chat = async (env: Env, team: DurableObjectStub<Team>, email: string, body: { messages: Msg[] }): Promise<Response> => {
  const messages: Msg[] = [{ role: "system", content: SYSTEM + digest(await team.snapshot()) }, ...body.messages.filter((m) => m.role !== "system")];
  for (let turn = 0; turn < 8; turn++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.OPENAI_MODEL, messages, tools: TOOLS }),
    });
    if (!res.ok) return reply(messages, [], `The model API refused (${res.status}): ${(await res.text()).slice(0, 300)}`); // a wrong model id or key diagnoses itself here
    const msg = ((await res.json()) as { choices: { message: Msg }[] }).choices[0]!.message;
    messages.push(msg);
    if (!msg.tool_calls?.length) break;
    for (const call of msg.tool_calls) {
      const input = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      const result =
        call.function.name === "find" ? await team.find(input) :
        call.function.name === "ask" ? await team.ask(input as never) :
        await team.check(email, (input.facts ?? []) as Payload[]); // draft: dry-run the guard
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      if (call.function.name === "draft" && (result as { refused: unknown[] }).refused.length === 0)
        return reply(messages, (input.facts ?? []) as Payload[]); // clean draft: hand it to the human
    }
  }
  return reply(messages, []);
};

const reply = (messages: Msg[], drafts: Payload[], error?: string) => {
  const text = error ?? messages.findLast((m) => m.role === "assistant" && m.content)?.content ?? "Here's what I put together.";
  return new Response(JSON.stringify({ reply: text, drafts, messages: messages.slice(1) }), { headers: { "Content-Type": "application/json" } });
};
