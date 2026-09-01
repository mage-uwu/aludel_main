import { expect, test, vi } from "vitest";
import { apply, empty, guard, plan, versioned, type Draft, type Payload, type State, type Template, type TemplateId } from "../src/kernel";
import { chat, voice } from "./agent";
import type { Env } from "./index";

// The desk drives a real guard here: edit_template must produce a whole, well-keyed next
// version from the model's loose speech, and a hand-rolled junk fact must never stage.
const V1: Template = { id: "tpl1" as TemplateId, version: 1, name: "Pool Report", tasks: [
  { key: "water", title: "Water Inspection", cadence: { every: 1, unit: "week", withinDays: 7 },
    blocks: [{ key: "ph", kind: "number", label: "pH", required: false, min: 0, max: 14 }],
    outcomes: [{ key: "clear", label: "CLEAR", cost: 1 }] }] };
const world = (): State => { const s = empty();
  for (const p of [{ type: "granted", email: "boss@x.co", role: "admin" }, { type: "signed", template: V1 }] as Payload[])
    apply(s, { ...p, actor: "boss@x.co", at: 1, seq: 1 } as Draft & { seq: number });
  return s; };
const team = (s: State) => ({ snapshot: () => ({ head: 2, sites: s.sites, templates: s.templates, latest: s.latest, actors: s.actors }),
  check: (actor: string, facts: Payload[]) => ({ refused: facts.flatMap((p) => { const why = guard(s, { ...p, actor, at: Date.now() }); return why ? [{ draft: p, reason: why }] : []; }) }),
  find: () => [], ask: () => ({}) }) as never;
const env = { OPENAI_API_KEY: "k", OPENAI_MODEL: "m" } as Env;
const script = (...turns: unknown[][]) => { let i = 0;
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ id: `r${i}`, output: turns[i++] ?? [{ type: "message", content: [{ type: "output_text", text: "done." }] }] })))); };

test("edit_template: loose model speech becomes a whole, keyed, versioned signed draft", async () => {
  script([{ type: "function_call", call_id: "c1", name: "edit_template", arguments: JSON.stringify({ id: "tpl1", tasks: [
    { key: "water", title: "Water Inspection", cadence: V1.tasks[0]!.cadence, outcomes: [{ key: "clear", label: "CLEAR", cost: 1 }], blocks: [{ key: "ph", kind: "number", label: "pH", min: 0, max: 14 }] },
    { title: "filter_cleaning", cadence: { every: 1, unit: "week", withinDays: 7 }, outcomes: [{ label: "cleaned" }, { label: "not_cleaned" }], blocks: [{ kind: "photo", label: "filter photo", required: true }] }] }) }]);
  const out = await (await chat(env, team(world()), "boss@x.co", { text: "add filter cleaning" })).json() as { drafts: Payload[] };
  expect(out.drafts).toHaveLength(1);
  const f = out.drafts[0]!; if (f.type !== "signed") throw new Error("not signed");
  expect(f.template.version).toBe(2); expect(f.template.name).toBe("Pool Report");
  const t = f.template.tasks[1]!;
  expect(t.key).toBe("filter_cleaning"); expect(t.title).toBe("filter cleaning");
  expect(t.outcomes.map((o) => [o.key, o.label, o.cost])).toEqual([["cleaned", "CLEANED", 1], ["not_cleaned", "NOT CLEANED", 1]]);
  expect(t.blocks[0]).toMatchObject({ key: "filter_photo", kind: "photo", label: "filter photo", required: true });
  expect(guard(world(), { ...f, actor: "boss@x.co", at: Date.now() })).toBeNull(); // the guard would admit it
});

test("an invented fact type is refused by the guard and never stages", async () => {
  script([{ type: "function_call", call_id: "c1", name: "draft", arguments: JSON.stringify({ facts: [{ type: "template_task_added", task: "Filter Cleaning" }] }) }]);
  const out = await (await chat(env, team(world()), "boss@x.co", { text: "add it" })).json() as { drafts: Payload[] };
  expect(out.drafts).toHaveLength(0);
  expect(guard(world(), { type: "template_task_added", actor: "boss@x.co", at: 1 } as never as Draft)).toBe("no such fact type");
});

test("retire_template stages a retirement the guard admits; edit_template can never set one", async () => {
  script([{ type: "function_call", call_id: "c1", name: "retire_template", arguments: JSON.stringify({ id: "tpl1" }) }]);
  const out = await (await chat(env, team(world()), "boss@x.co", { text: "delete pool report" })).json() as { drafts: Payload[] };
  const f = out.drafts[0]!; if (f.type !== "signed") throw new Error("not signed");
  expect(f.template.retired).toBe(true);
  expect(f.template.version).toBe(2);
  expect(f.template.tasks).toEqual(V1.tasks); // retirement keeps the content: history still renders
  expect(guard(world(), { ...f, actor: "boss@x.co", at: Date.now() })).toBeNull();

  script([{ type: "function_call", call_id: "c1", name: "edit_template", arguments: JSON.stringify({ id: "tpl1", tasks: [
    { key: "water", title: "Water Inspection", retired: true, outcomes: [{ key: "clear", label: "CLEAR" }], blocks: [{ kind: "number", label: "pH" }] }] }) }]);
  const via = await (await chat(env, team(world()), "boss@x.co", { text: "sneak" })).json() as { drafts: Payload[] };
  const g = via.drafts[0]!; if (g.type !== "signed") throw new Error("not signed");
  expect(g.template.retired).toBeUndefined();
});

test("a retired template plans no new work, and its logged entries still render", () => {
  const s = world();
  const retire: Payload = { type: "signed", template: { ...V1, version: 2, retired: true } };
  apply(s, { ...retire, actor: "boss@x.co", at: 1, seq: 3 } as Draft & { seq: number });
  expect(plan(s, Date.now(), 42)).toEqual([]);
  expect(versioned(s, V1.id, 1)).toEqual(V1); // the version entries pinned is untouched
});

// The model's shapes are advisory. A tool call that omits a "required" field must degrade to a
// refusal the human can read, never to an uncaught throw the browser reports as a bare 500.
test("malformed tool calls do not throw", async () => {
  const bad = [
    { name: "edit_template", arguments: JSON.stringify({ id: "tpl1" }) },                          // no tasks
    { name: "edit_template", arguments: JSON.stringify({ id: "tpl1", tasks: [{ title: "X" }] }) }, // task with no blocks/outcomes
    { name: "edit_template", arguments: JSON.stringify({ id: "tpl1", tasks: [{ outcomes: [{}], blocks: [{}] }] }) }, // no titles at all
    { name: "retire_template", arguments: JSON.stringify({}) },                                    // no id
    { name: "edit_template", arguments: "{not json" },                                             // arguments are not JSON
  ];
  for (const [i, call] of bad.entries()) {
    script([{ type: "function_call", call_id: `c${i}`, name: call.name, arguments: call.arguments }]);
    const out = await chat(env, team(world()), "boss@x.co", { text: "go" }).then((r) => r.json() as Promise<{ reply: string }>);
    expect(typeof out.reply).toBe("string");
  }
});

// The name they already said must reach the interview, or the first thing it does is ask for
// what they just told it. new_template forks the thread before the call, so `named` rides on
// the reply itself — and it is label-hygiened on the way out like every other human-facing word.
test("new_template carries a name the human already gave, and cleans it", async () => {
  script([{ type: "function_call", call_id: "c1", name: "new_template", arguments: JSON.stringify({ id: "tpl1", named: "cover_cleaning" }) }]);
  const out = await (await chat(env, team(world()), "boss@x.co", { text: "lets name a new section: cover cleaning" })).json() as { wizard: unknown; named?: string };
  expect(out.wizard).toBe("tpl1"); expect(out.named).toBe("cover cleaning");
});

test("new_template without a name leaves the interview to ask for one", async () => {
  script([{ type: "function_call", call_id: "c1", name: "new_template", arguments: JSON.stringify({}) }]);
  const out = await (await chat(env, team(world()), "boss@x.co", { text: "new report please" })).json() as { wizard: unknown; named?: string };
  expect(out.wizard).toBe(true); expect(out.named).toBeUndefined();
});

// The ear: the browser needs a key of its own to hold a microphone open to the model, and our
// real key must never be the one it holds. Everything else about voice is the prompt it already
// had — a finished sentence goes in as if typed — so this is the whole of the server's part.
let asked: { url: string; body: { session: Record<string, unknown> } } | null = null;
const ear = (env: Partial<Env>, upstream: Response) => { asked = null;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => { asked = { url, body: JSON.parse(String(init.body)) as never }; return Promise.resolve(upstream); });
  return voice({ OPENAI_API_KEY: "real-key", OPENAI_HEAR_MODEL: "whisper-1", ...env } as Env);
};

// The shape the API actually wants, pinned. The beta's /realtime/sessions is a 404 now and its
// flat input_audio_transcription is gone; GA mints at /realtime/client_secrets and nests the
// ear's settings under session.audio.input. A user found that for us once; not twice.
test("voice: asks the GA endpoint, in the GA shape, for an ear that only listens", async () => {
  await ear({ OPENAI_VOICE_MODEL: "gpt-realtime-mini" }, new Response(JSON.stringify({ value: "ek" })));
  const { url, body } = asked!; const session = body.session;
  expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
  expect(session).toMatchObject({ type: "realtime", model: "gpt-realtime-mini", output_modalities: ["text"],
    audio: { input: { transcription: { model: "whisper-1" }, turn_detection: { type: "server_vad", create_response: false } } } });
});

test("voice: the worker hands out an ephemeral key, never its own", async () => {
  const res = await ear({ OPENAI_VOICE_MODEL: "gpt-realtime-mini" },
    new Response(JSON.stringify({ value: "ek_temp" })));
  const out = await res.json() as { secret: string };
  expect(out).toEqual({ secret: "ek_temp" });
  expect(JSON.stringify(out)).not.toContain("real-key");
});

test("voice: a missing model id refuses by name, rather than sailing on as undefined", async () => {
  const no = await ear({ OPENAI_HEAR_MODEL: undefined }, new Response("{}"));
  expect(no.status).toBe(501);
  expect((await no.json() as { error: string }).error).toMatch(/OPENAI_VOICE_MODEL/);
  // the one that actually bit: unset, it stringified away and OpenAI answered with its own 400
  const deaf = await ear({ OPENAI_VOICE_MODEL: "gpt-realtime-mini", OPENAI_HEAR_MODEL: undefined }, new Response("{}"));
  expect(deaf.status).toBe(501);
  expect((await deaf.json() as { error: string }).error).toMatch(/OPENAI_HEAR_MODEL/);
});

test("voice: an upstream refusal reaches the human as words", async () => {
  const res = await ear({ OPENAI_VOICE_MODEL: "gpt-realtime-mini" }, new Response("model not found", { status: 404 }));
  expect(res.status).toBe(502);
  expect((await res.json() as { error: string }).error).toMatch(/404.*model not found/);
});
