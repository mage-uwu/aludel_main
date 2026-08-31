// The kernel: five nouns, eight facts, one guard, one fold. Everything here is pure.
// The ledger is an ordered list of facts; every view is fold(facts) seen through a lens at `now`.
type Id<B extends string> = string & { readonly __brand: B };
export type SiteId = Id<"site">; export type TemplateId = Id<"template">;
export type FormId = Id<"form">; export type EntryId = Id<"entry">;
export const newId = <I extends string>(): I =>
  ((globalThis as { crypto?: Crypto }).crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`) as I;

export type Role = "field" | "office" | "admin"; const RANK: Record<Role, number> = { field: 0, office: 1, admin: 2 };

// -- the five nouns -----------------------------------------------------------------------
export type Actor = { email: string; role: Role };
export type Service = { template: TemplateId; anchor: number; skips: number[]; allotments: Record<string, number>; list?: string; assignee?: string };
export type Site = { id: SiteId; client: { name: string; address: string; email: string }; services: Service[] };
export type Block =
  | { key: string; kind: "text"; label: string; required: boolean; placeholder: string }
  | { key: string; kind: "number"; label: string; required: boolean; min: number; max: number }
  | { key: string; kind: "photo"; label: string; required: boolean }
  | { key: string; kind: "button"; label: string; action: "submit" | "reset" };
export type Outcome = { key: string; label: string; cost: number };
export type Cadence = { every: number; unit: "day" | "week" | "month"; withinDays: number; day?: number }; // day = the weekday a binding starts from by default; the site's anchor still wins
export type Task = { key: string; title: string; cadence?: Cadence; blocks: Block[]; outcomes: Outcome[] };
export type Template = { id: TemplateId; version: number; name: string; tasks: Task[] };
export type Form = { id: FormId; template: TemplateId; version: number; site: SiteId; meta: Record<string, string> };
export type Value = string | number; // photos are content hashes
export type Logged = { at: number; actor: string; values: Record<string, Value>; outcome: string };
export type Entry = { id: EntryId; form: FormId; task: string; window: { from: number; due: number }; list?: string; assignee?: string };

// -- the eight facts ----------------------------------------------------------------------
export type Payload =
  | { type: "granted"; email: string; role: Role }
  | { type: "declared"; site: Site }
  | { type: "signed"; template: Template }
  | { type: "bound"; site: SiteId; service: Service }
  | { type: "dispatched"; form: Form; entries: Entry[] }
  | { type: "logged"; entry: EntryId; values: Record<string, Value>; outcome: string }
  | { type: "corrected"; entry: EntryId; values: Record<string, Value>; outcome: string; reason: string }
  | { type: "steered"; entry: EntryId; due?: number; list?: string; assignee?: string; reason: string }; // office redirects one entry's future
export type Fact = Payload & { seq: number; at: number; actor: string; via?: "agent" };
export type Draft = Payload & { at: number; actor: string; via?: "agent" }; // the ledger assigns seq

// -- the fold -----------------------------------------------------------------------------
// A record is an entry plus what happened to it: the first log, then any corrections.
export type Rec = Entry & { logged?: Logged; trail: Logged[] };
export type State = {
  actors: Record<string, Actor>;
  sites: Record<SiteId, Site>;
  templates: Record<string, Template>; // keyed "id@version"; every version kept, forever
  latest: Record<TemplateId, number>;
  forms: Record<FormId, Form>;
  entries: Record<EntryId, Rec>;
};
export const empty = (): State => ({ actors: {}, sites: {}, templates: {}, latest: {}, forms: {}, entries: {} });
export const versioned = (s: State, id: TemplateId, v: number): Template | undefined => s.templates[`${id}@${v}`];
export const taskOf = (s: State, r: Entry): Task | undefined =>
  s.forms[r.form] && versioned(s, s.forms[r.form]!.template, s.forms[r.form]!.version)?.tasks.find((t) => t.key === r.task);

// apply mutates: the state is the fold's own accumulator, never shared while folding.
export const apply = (s: State, f: Fact): void => {
  switch (f.type) {
    case "granted": s.actors[f.email] = { email: f.email, role: f.role }; break;
    case "declared": s.sites[f.site.id] = f.site; break; // latest declaration wins, whole
    case "signed": s.templates[`${f.template.id}@${f.template.version}`] = f.template; s.latest[f.template.id] = f.template.version; break;
    case "bound": { const site = s.sites[f.site]; if (site) site.services = [...site.services.filter((x) => x.template !== f.service.template), f.service]; break; }
    case "dispatched": s.forms[f.form.id] = f.form; for (const e of f.entries) s.entries[e.id] = { ...e, trail: [] }; break;
    case "logged": case "corrected": {
      const r = s.entries[f.entry]; if (!r) break;
      const l: Logged = { at: f.at, actor: f.actor, values: f.values, outcome: f.outcome };
      r.logged ? r.trail.push(l) : (r.logged = l); // a second log folds into the trail (law 6)
      break;
    }
    case "steered": { // Object.assign skips the falses: only the fields the fact names change
      const r = s.entries[f.entry];
      if (r && !r.logged) Object.assign(r, f.list !== undefined && { list: f.list }, f.assignee !== undefined && { assignee: f.assignee }, f.due !== undefined && { window: { ...r.window, due: f.due } });
    }
  }
};
export const fold = (facts: readonly Fact[]): State => { const s = empty(); for (const f of facts) apply(s, f); return s; };

// -- the four lenses ----------------------------------------------------------------------
export type Status = "scheduled" | "pending" | "overdue" | "logged";
export const status = (r: Rec, now: number): Status => (r.logged ? "logged" : now < r.window.from ? "scheduled" : now <= r.window.due ? "pending" : "overdue");
export const late = (r: Rec): boolean => !!r.logged && r.logged.at > r.window.due;
export const effective = (r: Rec): Logged | undefined => r.trail.at(-1) ?? r.logged; // latest correction wins

// -- the guard ----------------------------------------------------------------------------
// The only defended surface: what may be appended, and by whom. null admits; a string refuses.
const GATE: Record<Payload["type"], Role> = { granted: "admin", declared: "office", signed: "office", bound: "office", dispatched: "office", logged: "field", corrected: "field", steered: "office" };
const sameDay = (a: number, b: number) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
const badValue = (task: Task, key: string, v: Value): boolean => {
  const b = task.blocks.find((x) => x.key === key); // no such block, a button, or the wrong shape
  return !b || b.kind === "button" || (b.kind === "number" ? typeof v !== "number" : typeof v !== "string");
};
const badKeys = (tpl: Template, prior: Template[]): string | null => {
  const kinds = new Map<string, string>();
  for (const p of prior) for (const t of p.tasks) for (const b of t.blocks) kinds.set(`${t.key}/${b.key}`, b.kind);
  for (const t of tpl.tasks) {
    if (tpl.tasks.filter((x) => x.key === t.key).length > 1) return `duplicate task key ${t.key}`;
    if (!t.outcomes.length) return `task ${t.key} has no outcomes`;
    for (const b of t.blocks) {
      if (t.blocks.filter((x) => x.key === b.key).length > 1) return `duplicate block key ${b.key}`;
      const was = kinds.get(`${t.key}/${b.key}`); // keys are never retyped
      if (was && was !== b.kind) return `block ${t.key}/${b.key} was ${was}, cannot become ${b.kind}`;
    }
  }
  return null;
};

export const guard = (s: State, d: Draft): string | null => {
  const boot = d.type === "granted" && Object.keys(s.actors).length === 0; // the first grant founds the team
  const role = d.actor === "scheduler" ? "office" : s.actors[d.actor]?.role;
  if (!role && !boot) return "unknown actor";
  if (role && RANK[role] < RANK[GATE[d.type]]) return `${d.type} needs ${GATE[d.type]}`;
  switch (d.type) {
    case "granted": case "declared": return null;
    case "signed": {
      const head = s.latest[d.template.id] ?? 0;
      if (d.template.version !== head + 1) return `version must be ${head + 1}`;
      return badKeys(d.template, Array.from({ length: head }, (_, i) => versioned(s, d.template.id, i + 1)).filter((t): t is Template => !!t));
    }
    case "bound": return !s.sites[d.site] ? "unknown site" : !s.latest[d.service.template] ? "unknown template" : null;
    case "dispatched": {
      const tpl = versioned(s, d.form.template, d.form.version);
      if (!s.sites[d.form.site]) return "unknown site";
      if (!tpl) return "unknown template version"; // an entry always renders against a pinned version
      for (const e of d.entries) {
        if (s.entries[e.id]) return "entry id already exists";
        if (e.form !== d.form.id) return "entry outside its form";
        if (!tpl.tasks.some((t) => t.key === e.task)) return `unknown task ${e.task}`;
        if (e.window.from > e.window.due) return "window ends before it starts";
      }
      return null;
    }
    case "logged": case "corrected": {
      const r = s.entries[d.entry]; const task = r && taskOf(s, r);
      if (!r || !task) return "unknown entry";
      if (d.type === "corrected") {
        if (!r.logged) return "nothing to correct";
        if (role === "field" && (r.logged.actor !== d.actor || !sameDay(d.at, r.logged.at))) return "field corrects only its own entry, same day";
      }
      if (!task.outcomes.some((o) => o.key === d.outcome)) return `unknown outcome ${d.outcome}`;
      for (const [k, v] of Object.entries(d.values)) if (badValue(task, k, v)) return `bad value for ${k}`;
      return null;
    }
    case "steered": {
      const r = s.entries[d.entry];
      return !r ? "unknown entry" : r.logged ? "already logged" : d.due !== undefined && d.due < r.window.from ? "due before from" : null;
    }
  }
};

// -- the scheduler ------------------------------------------------------------------------
// Pure planning: which forms and entries should exist between now and the horizon, that
// don't already. The cron appends what this returns, as actor "scheduler".
const DAY = 86_400_000;
const step = (anchor: number, k: number, c: Cadence): number =>
  c.unit !== "month" ? anchor + k * c.every * (c.unit === "week" ? 7 : 1) * DAY
  : new Date(anchor).setUTCMonth(new Date(anchor).getUTCMonth() + k * c.every);
export const plan = (s: State, now: number, horizonDays: number): Extract<Payload, { type: "dispatched" }>[] => {
  const have = new Set(Object.values(s.entries).map((e) => `${s.forms[e.form]?.site}|${e.task}|${e.window.from}`));
  const out: Extract<Payload, { type: "dispatched" }>[] = [];
  for (const site of Object.values(s.sites)) for (const svc of site.services) {
    const tpl = versioned(s, svc.template, s.latest[svc.template] ?? 0);
    if (!tpl) continue;
    const batch = new Map<number, Entry[]>(); // occurrences sharing a date share a form
    for (const task of tpl.tasks) {
      if (!task.cadence) continue;
      for (let k = 0; ; k++) {
        const from = step(svc.anchor, k, task.cadence);
        if (from > now + horizonDays * DAY) break;
        const due = from + task.cadence.withinDays * DAY;
        if (due < now || svc.skips.some((x) => sameDay(x, from)) || have.has(`${site.id}|${task.key}|${from}`)) continue;
        batch.set(from, [...(batch.get(from) ?? []), { id: newId<EntryId>(), form: "" as FormId, task: task.key, window: { from, due }, // allocation flows from the binding:
          ...(svc.list && { list: svc.list }), ...(svc.assignee && { assignee: svc.assignee }) }]);
      }
    }
    for (const [, entries] of batch) {
      const form: Form = { id: newId(), template: tpl.id, version: tpl.version, site: site.id, meta: { name: site.client.name, address: site.client.address } };
      out.push({ type: "dispatched", form, entries: entries.map((e) => ({ ...e, form: form.id })) });
    }
  }
  return out;
};
