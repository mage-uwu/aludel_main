import Anthropic from "@anthropic-ai/sdk";
import type { Payload } from "../src/kernel";
import type { Team } from "./do";
import type { Env } from "./index";

// One agent, two roles. The oracle reads freely: find and ask run right here against the
// team's ledger. The hand only drafts: draft() ends the turn and hands the facts back to
// the client as a preview card — nothing becomes real until a human's tap appends it.
const TOOLS: Anthropic.Tool[] = [
  { name: "find", description: "Look up entries (units of scheduled work). Returns rows with status, window, and what was logged. Statuses: scheduled|pending|overdue|logged.",
    input_schema: { type: "object", properties: { site: { type: "string" }, task: { type: "string" }, actor: { type: "string" }, status: { type: "string" }, from: { type: "number" }, to: { type: "number" } } } },
  { name: "ask", description: "Aggregate one channel of history. channel is a block key, or 'outcome'. Legal aggs — number: sum|avg|min|max|last; text: last|count; photo: count|presence; outcome: tally|cost. Answers carry value, n (entries that recorded it), of (entries in scope).",
    input_schema: { type: "object", properties: { template: { type: "string" }, task: { type: "string" }, channel: { type: "string" }, agg: { type: "string" }, site: { type: "string" }, actor: { type: "string" }, from: { type: "number" }, to: { type: "number" } }, required: ["template", "task", "channel", "agg"] } },
  { name: "draft", description: "Propose facts to append to the ledger (declared|signed|bound|dispatched|granted|rewindowed). They are checked, then shown to the human, who commits or discards them. Call once, with the complete set, after your reads.",
    input_schema: { type: "object", properties: { facts: { type: "array", items: { type: "object" } } }, required: ["facts"] } },
];

const digest = (t: Awaited<ReturnType<DurableObjectStub<Team>["snapshot"]>>) => JSON.stringify({
  now: Date.now(),
  actors: Object.values(t.actors),
  sites: Object.values(t.sites),
  templates: Object.entries(t.latest).map(([id, v]) => t.templates[`${id}@${v}`]),
});

const SYSTEM = `You are the office desk of a trades team. Their world: a Site is a place with a
client; a Template (versioned) declares Tasks, each with typed blocks, outcomes, and a cadence;
dispatching mints a Form and its Entries; the field logs each entry once, with an outcome.
Answer questions with find/ask and cite what you read — say the numbers' denominators out loud
("3 tabs across 1 of 4 visits"), never a bare figure. Make changes only via draft, and keep
drafts minimal and complete: new ids as short random strings; template edits are a whole new
version with the same task/block/outcome keys (never retype a key); windows and times are epoch
ms. If the human's ask is ambiguous, ask back instead of guessing. Team state:\n`;

export const chat = async (env: Env, team: DurableObjectStub<Team>, email: string, body: { messages: Anthropic.MessageParam[] }): Promise<Response> => {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [...body.messages];
  const system = SYSTEM + digest(await team.snapshot());
  for (let turn = 0; turn < 8; turn++) {
    const res = await client.messages.create({ model: "claude-opus-5", max_tokens: 16000, system, tools: TOOLS, messages });
    messages.push({ role: "assistant", content: res.content });
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason === "pause_turn") continue;
    if (res.stop_reason !== "tool_use" || calls.length === 0) break;
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const input = call.input as Record<string, unknown>;
      const result =
        call.name === "find" ? await team.find(input) :
        call.name === "ask" ? await team.ask(input as never) :
        await team.check(email, (input.facts ?? []) as Payload[]); // draft: dry-run the guard
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
      if (call.name === "draft" && (result as { refused: unknown[] }).refused.length === 0)
        return json(messages, (input.facts ?? []) as Payload[]); // clean draft: hand it to the human
    }
    messages.push({ role: "user", content: results });
  }
  return json(messages, []);
};

const json = (messages: Anthropic.MessageParam[], drafts: Payload[]) => {
  const last = messages.findLast((m) => m.role === "assistant")?.content;
  const reply = (Array.isArray(last) ? last.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n") : String(last ?? "")) || "Here's what I put together.";
  return new Response(JSON.stringify({ reply, drafts, messages }), { headers: { "Content-Type": "application/json" } });
};
