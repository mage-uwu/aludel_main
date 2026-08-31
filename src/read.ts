import { effective, status, taskOf, type Rec, type SiteId, type State, type Status, type TemplateId, type Value } from "./kernel";

// The whole read surface: find answers "did Keegan do Mike's last Wednesday?",
// ask answers "how much chlorine this season?". Both pure, both f(state, now).
export type Filter = { site?: SiteId; task?: string; actor?: string; status?: Status; list?: string; from?: number; to?: number };
export type Hit = Rec & { site: SiteId; status: Status };

export const find = (s: State, f: Filter, now: number): Hit[] =>
  Object.values(s.entries)
    .map((r) => ({ ...r, site: s.forms[r.form]?.site as SiteId, status: status(r, now) }))
    .filter((r) =>
      (!f.site || r.site === f.site) && (!f.task || r.task === f.task) && (!f.list || r.list === f.list) &&
      (!f.actor || effective(r)?.actor === f.actor || r.assignee === f.actor) && (!f.status || r.status === f.status) &&
      (f.from === undefined || (r.logged?.at ?? r.window.due) >= f.from) && (f.to === undefined || (r.logged?.at ?? r.window.from) <= f.to))
    .sort((a, b) => a.window.due - b.window.due);

// The calculator. The block's kind decides which aggregations are legal, so an invalid
// question cannot be expressed. Every answer carries its denominator (law 7).
export const LEGAL = { number: ["sum", "avg", "min", "max", "last"], text: ["last", "count"], photo: ["count", "presence"], outcome: ["tally", "cost"] } as const;
export type Agg = (typeof LEGAL)[keyof typeof LEGAL][number];
export type Query = { template: TemplateId; task: string; channel: string; agg: Agg } & Omit<Filter, "task">;
export type Answer = { value: number | string | Record<string, number> | null; n: number; of: number };

export const ask = (s: State, q: Query, now: number): Answer | { error: string } => {
  const scoped = find(s, { ...q, status: undefined }, now).filter((r) => s.forms[r.form]?.template === q.template && r.task === q.task); const done = scoped.map(effective).filter((l): l is NonNullable<typeof l> => !!l);
  const kind = q.channel === "outcome" ? "outcome" : scoped.map((r) => taskOf(s, r)).find(Boolean)?.blocks.find((b) => b.key === q.channel)?.kind;
  if (!kind || kind === "button") return { error: `no channel ${q.channel} on task ${q.task}` };
  if (!(LEGAL[kind as keyof typeof LEGAL] as readonly string[]).includes(q.agg)) return { error: `${q.agg} is not legal on ${kind}` };
  if (kind === "outcome") {
    const tally: Record<string, number> = {}; for (const l of done) tally[l.outcome] = (tally[l.outcome] ?? 0) + 1;
    if (q.agg === "tally") return { value: tally, n: done.length, of: scoped.length };
    const costs = new Map(scoped.map((r) => taskOf(s, r)).find(Boolean)?.outcomes.map((o) => [o.key, o.cost]) ?? []);
    return { value: done.reduce((sum, l) => sum + (costs.get(l.outcome) ?? 0), 0), n: done.length, of: scoped.length }; }
  const vals = done.map((l) => l.values[q.channel]).filter((v): v is Value => v !== undefined); const nums = vals.filter((v): v is number => typeof v === "number");
  const value =
    q.agg === "sum" ? nums.reduce((a, b) => a + b, 0) : q.agg === "avg" ? (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null) :
    q.agg === "min" ? (nums.length ? Math.min(...nums) : null) : q.agg === "max" ? (nums.length ? Math.max(...nums) : null) :
    q.agg === "last" ? (vals.at(-1) ?? null) : q.agg === "presence" ? (vals.length ? 1 : 0) : vals.length; // count
  return { value, n: vals.length, of: scoped.length };
};

// Balance: what remains of a site's allotment for one task. allotment − Σ cost(outcome).
export const balance = (s: State, site: SiteId, template: TemplateId, task: string, now: number): { left: number; spent: number; of: number } | null => {
  const allotted = s.sites[site]?.services.find((x) => x.template === template)?.allotments[task];
  const spent = allotted === undefined ? null : ask(s, { template, task, channel: "outcome", agg: "cost", site }, now);
  return spent === null || "error" in spent ? null : { left: allotted! - (spent.value as number), spent: spent.value as number, of: allotted! };
};
