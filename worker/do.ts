import { DurableObject } from "cloudflare:workers";
import { apply, empty, fold, guard, plan, type Draft, type Fact, type Payload, type State } from "../src/kernel";
import { ask, find, type Filter, type Query } from "../src/read";
import type { Env } from "./index";

// One Durable Object per team. The DO *is* the team: its SQLite table is the ledger, its
// single thread is the serializer that gives facts their total order (law 6).
export class Team extends DurableObject<Env> {
  private s: State = empty();
  private head = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS facts (seq INTEGER PRIMARY KEY, body TEXT NOT NULL)");
    const rows = [...ctx.storage.sql.exec<{ body: string }>("SELECT body FROM facts ORDER BY seq")];
    this.s = fold(rows.map((r) => JSON.parse(r.body) as Fact));
    this.head = rows.length;
    // one alarm per DO, and setAlarm replaces it — only arm when none is pending
    ctx.blockConcurrencyWhile(async () => { if ((await ctx.storage.getAlarm()) === null) await ctx.storage.setAlarm(Date.now() + 60_000); });
  }

  // The only write path. Everything—app, agent, scheduler—appends through the same guard.
  append(actor: string, drafts: (Payload & { via?: "agent" })[]): { admitted: Fact[]; refused: { draft: Payload; reason: string }[] } {
    const admitted: Fact[] = [];
    const refused: { draft: Payload; reason: string }[] = [];
    for (const p of drafts) {
      const draft: Draft = { ...p, actor, at: Date.now() };
      const reason = guard(this.s, draft);
      if (reason) { refused.push({ draft: p, reason }); continue; }
      const fact: Fact = { ...draft, seq: ++this.head };
      this.ctx.storage.sql.exec("INSERT INTO facts (seq, body) VALUES (?, ?)", fact.seq, JSON.stringify(fact));
      apply(this.s, fact);
      admitted.push(fact);
    }
    return { admitted, refused };
  }

  pull(since: number): Fact[] {
    return [...this.ctx.storage.sql.exec<{ body: string }>("SELECT body FROM facts WHERE seq > ? ORDER BY seq", since)].map((r) => JSON.parse(r.body) as Fact);
  }

  role(email: string): string | null { return this.s.actors[email]?.role ?? (this.head === 0 ? "founder" : null); }
  check(actor: string, drafts: Payload[]): { refused: { draft: Payload; reason: string }[] } {  // the agent's dry run
    const ghost = structuredClone(this.s);
    const refused: { draft: Payload; reason: string }[] = [];
    for (const p of drafts) {
      const reason = guard(ghost, { ...p, actor, at: Date.now() });
      reason ? refused.push({ draft: p, reason }) : apply(ghost, { ...p, actor, at: Date.now(), seq: 0 });
    }
    return { refused };
  }
  find(filter: Filter) { return find(this.s, filter, Date.now()); }
  ask(query: Query) { return ask(this.s, query, Date.now()); }
  snapshot() { return { head: this.head, sites: this.s.sites, templates: this.s.templates, latest: this.s.latest, actors: this.s.actors }; }

  async alarm(): Promise<void> { // idempotent: plan() only mints what is missing, so retries are safe
    this.append("scheduler", plan(this.s, Date.now(), 42)); // keep six weeks of work materialized
    await this.ctx.storage.setAlarm(Date.now() + 86_400_000);
  }
}
