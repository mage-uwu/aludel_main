import { expect, test } from "vitest";
import { apply, empty, fold, guard, late, newId, plan, status, type Draft, type EntryId, type Fact, type Payload, type SiteId, type Template, type TemplateId } from "./kernel";
import { ask, balance, find } from "./read";

// A tiny world: one admin, one office, one field hand, Mike's pool, one template.
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 7, 3); // Monday
const TPL = "tpl-pool" as TemplateId;
const MIKE = "site-mike" as SiteId;
const template = (version: number, tasks?: Template["tasks"]): Template => ({
  id: TPL, version, name: "Pool report",
  tasks: tasks ?? [
    { key: "clean", title: "Weekly clean", cadence: { every: 1, unit: "week", withinDays: 3 },
      blocks: [
        { key: "chlorine", kind: "number", label: "Chlorine tabs", required: true, min: 0, max: 20 },
        { key: "notes", kind: "text", label: "Notes", required: false, placeholder: "" },
      ],
      outcomes: [{ key: "OPEN", label: "Open", cost: 1 }, { key: "CLOSED", label: "Closed", cost: 1 }, { key: "NO_ACCESS", label: "No access", cost: 0 }] },
    { key: "drain", title: "Drain and fill", cadence: { every: 10, unit: "week", withinDays: 21 },
      blocks: [{ key: "litres", kind: "number", label: "Litres", required: true, min: 0, max: 99999 }],
      outcomes: [{ key: "DONE", label: "Done", cost: 0 }, { key: "SKIP", label: "Skipped", cost: 0 }] },
  ],
});

// The ledger under test: append through the guard exactly as the DO will.
const ledger = () => {
  const facts: Fact[] = [];
  const s = empty();
  const append = (actor: string, p: Payload, at = T0): string | null => {
    const draft: Draft = { ...p, actor, at };
    const veto = guard(s, draft);
    if (!veto) { const f: Fact = { ...draft, seq: facts.length + 1 }; facts.push(f); apply(s, f); }
    return veto;
  };
  return { facts, s, append };
};
const founded = () => {
  const l = ledger();
  expect(l.append("dana@x.co", { type: "granted", email: "dana@x.co", role: "admin" })).toBeNull();
  l.append("dana@x.co", { type: "granted", email: "keegan@x.co", role: "field" });
  l.append("dana@x.co", { type: "signed", template: template(1) });
  l.append("dana@x.co", { type: "declared", site: { id: MIKE, client: { name: "Mike", address: "14 Elm", email: "mike@pools.com" }, services: [] } });
  l.append("dana@x.co", { type: "bound", site: MIKE, service: { template: TPL, anchor: T0, skips: [], allotments: { clean: 13 } } });
  return l;
};
const dispatched = () => {
  const l = founded();
  for (const p of plan(l.s, T0, 6)) expect(l.append("scheduler", p)).toBeNull();
  const entries = Object.values(l.s.entries);
  return { ...l, clean: entries.find((e) => e.task === "clean")!, drain: entries.find((e) => e.task === "drain")! };
};

test("only the first grant may found the team", () => {
  const l = ledger();
  expect(l.append("stranger@x.co", { type: "declared", site: { id: MIKE, client: { name: "", address: "", email: "" }, services: [] } })).toBe("unknown actor");
  expect(l.append("dana@x.co", { type: "granted", email: "dana@x.co", role: "admin" })).toBeNull();
  expect(l.append("mallory@x.co", { type: "granted", email: "mallory@x.co", role: "admin" })).toBe("unknown actor");
});

test("roles gate the facts", () => {
  const l = founded();
  expect(l.append("keegan@x.co", { type: "signed", template: template(2) })).toBe("signed needs office");
  expect(l.append("keegan@x.co", { type: "granted", email: "pal@x.co", role: "field" })).toBe("granted needs admin");
});

test("keys are never retyped, versions never skip", () => {
  const l = founded();
  const retyped = template(2);
  retyped.tasks[0]!.blocks[0] = { key: "chlorine", kind: "text", label: "Chlorine", required: false, placeholder: "" };
  expect(l.append("dana@x.co", { type: "signed", template: retyped })).toMatch(/was number/);
  expect(l.append("dana@x.co", { type: "signed", template: template(3) })).toBe("version must be 2");
  expect(l.append("dana@x.co", { type: "signed", template: template(2) })).toBeNull(); // a lawful rename/extend
});

test("the scheduler plans idempotently and groups by date", () => {
  const l = founded();
  const first = plan(l.s, T0, 6);
  expect(first).toHaveLength(1); // clean + drain both fall on the anchor Monday → one form
  expect(first[0]!.entries.map((e) => e.task).sort()).toEqual(["clean", "drain"]);
  for (const p of first) l.append("scheduler", p);
  expect(plan(l.s, T0, 6)).toHaveLength(0); // nothing new to mint
  expect(plan(l.s, T0, 7)).toHaveLength(1); // the next weekly clean enters the horizon
});

test("entries move through the four lenses", () => {
  const { s, clean, append } = dispatched();
  expect(status(clean, T0 - DAY)).toBe("scheduled");
  expect(status(clean, T0 + DAY)).toBe("pending");
  expect(status(clean, T0 + 4 * DAY)).toBe("overdue");
  append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: 3 }, outcome: "OPEN" }, T0 + 4 * DAY);
  expect(status(s.entries[clean.id]!, T0 + 4 * DAY)).toBe("logged");
  expect(late(s.entries[clean.id]!)).toBe(true); // lateness survives into history
});

test("logging is guarded by the pinned template", () => {
  const { clean, append } = dispatched();
  expect(append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: "three" }, outcome: "OPEN" })).toMatch(/bad value/);
  expect(append("keegan@x.co", { type: "logged", entry: clean.id, values: { ghost: 1 }, outcome: "OPEN" })).toMatch(/bad value/);
  expect(append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: 3 }, outcome: "MAYBE" })).toMatch(/unknown outcome/);
  expect(append("keegan@x.co", { type: "logged", entry: "ghost" as EntryId, values: {}, outcome: "OPEN" })).toBe("unknown entry");
  expect(append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: 3, notes: "algae" }, outcome: "OPEN" })).toBeNull();
});

test("corrections supersede without erasing, per policy", () => {
  const { s, clean, append } = dispatched();
  append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: 50 }, outcome: "OPEN" }, T0);
  expect(append("keegan@x.co", { type: "corrected", entry: clean.id, values: { chlorine: 5 }, outcome: "OPEN", reason: "typo" }, T0 + DAY))
    .toMatch(/same day/); // field, next day: refused
  expect(append("keegan@x.co", { type: "corrected", entry: clean.id, values: { chlorine: 5 }, outcome: "OPEN", reason: "typo" }, T0 + 60_000)).toBeNull();
  expect(append("dana@x.co", { type: "corrected", entry: clean.id, values: { chlorine: 6 }, outcome: "OPEN", reason: "audit" }, T0 + 30 * DAY)).toBeNull();
  const r = s.entries[clean.id]!;
  expect(r.logged!.values.chlorine).toBe(50); // the original is never erased
  expect(r.trail.map((c) => c.values.chlorine)).toEqual([5, 6]); // and the latest wins
});

test("a second log folds into the trail instead of being refused", () => {
  const { s, clean, append } = dispatched();
  append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: 3 }, outcome: "OPEN" }, T0);
  expect(append("dana@x.co", { type: "logged", entry: clean.id, values: { chlorine: 4 }, outcome: "CLOSED" }, T0 + 1)).toBeNull();
  expect(s.entries[clean.id]!.logged!.values.chlorine).toBe(3);
  expect(s.entries[clean.id]!.trail).toHaveLength(1);
});

test("rewindowing moves due dates, never logged ones", () => {
  const { s, clean, drain, append } = dispatched();
  expect(append("dana@x.co", { type: "rewindowed", entry: drain.id, due: T0 + 40 * DAY, reason: "mike travelling" })).toBeNull();
  expect(s.entries[drain.id]!.window.due).toBe(T0 + 40 * DAY);
  append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: 3 }, outcome: "OPEN" });
  expect(append("dana@x.co", { type: "rewindowed", entry: clean.id, due: T0 + 9 * DAY, reason: "" })).toBe("already logged");
});

test("find answers the Keegan question", () => {
  const { s, clean, append } = dispatched();
  append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: 3 }, outcome: "OPEN" }, T0 + 2 * DAY);
  const hits = find(s, { site: MIKE, actor: "keegan@x.co", status: "logged" }, T0 + 3 * DAY);
  expect(hits).toHaveLength(1);
  expect(hits[0]!.logged!.at).toBe(T0 + 2 * DAY);
  expect(find(s, { actor: "dana@x.co", status: "logged" }, T0 + 3 * DAY)).toHaveLength(0);
});

test("ask carries its denominator and refuses illegal questions", () => {
  const { s, clean, append } = dispatched();
  for (const p of plan(s, T0, 21)) append("scheduler", p); // three weeks of cleans on the books
  append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: 3 }, outcome: "OPEN" }, T0);
  const sum = ask(s, { template: TPL, task: "clean", channel: "chlorine", agg: "sum", site: MIKE }, T0 + DAY);
  expect(sum).toEqual({ value: 3, n: 1, of: 4 }); // 3 tabs — across 1 of 4 scheduled cleans
  expect(ask(s, { template: TPL, task: "clean", channel: "chlorine", agg: "presence" }, T0)).toHaveProperty("error");
  expect(ask(s, { template: TPL, task: "clean", channel: "outcome", agg: "tally" }, T0 + DAY)).toMatchObject({ value: { OPEN: 1 }, n: 1 });
});

test("balance is allotment minus outcome cost, a pure reading", () => {
  const { s, clean, append } = dispatched();
  append("keegan@x.co", { type: "logged", entry: clean.id, values: { chlorine: 3 }, outcome: "OPEN" }, T0);
  expect(balance(s, MIKE, TPL, "clean", T0 + DAY)).toEqual({ left: 12, spent: 1, of: 13 });
  expect(balance(s, MIKE, TPL, "drain", T0)).toBeNull(); // no allotment bound for drain
});

test("the fold is deterministic and replayable", () => {
  const { facts, s } = (() => { const d = dispatched(); d.append("keegan@x.co", { type: "logged", entry: d.clean.id, values: { chlorine: 3 }, outcome: "OPEN" }); return d; })();
  expect(fold(facts)).toEqual(s);
  expect(newId()).not.toBe(newId());
});
