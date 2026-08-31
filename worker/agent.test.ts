import { expect, test, vi } from "vitest";
import { apply, empty, guard, type Draft, type Payload, type State, type Template, type TemplateId } from "../src/kernel";
import { chat } from "./agent";
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
