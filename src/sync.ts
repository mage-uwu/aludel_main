import { apply, empty, fold, guard, plan, type Draft, type Fact, type Payload, type State } from "./kernel";

// The device's half of the ledger. IndexedDB mirrors the team's facts plus a queue of
// payloads not yet admitted by the server; the visible state is fold(facts + queue), so
// offline work shows immediately and reconciles by union when the network returns (law 6).
// With no server at all (the demo, or a solo phone) the same guard runs locally and the
// queue simply is the ledger.
const DB = (): Promise<IDBDatabase> => new Promise((ok, err) => {
  const req = indexedDB.open("aludel", 1);
  req.onupgradeneeded = () => { req.result.createObjectStore("kv"); req.result.createObjectStore("blobs"); };
  req.onsuccess = () => ok(req.result); req.onerror = () => err(req.error);
});
const op = async <T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> => {
  const db = await DB();
  return new Promise((ok) => { const r = run(db.transaction(store, mode).objectStore(store)); r.onsuccess = () => ok(r.result as T); r.onerror = () => ok(undefined); });
};
const idb = {
  get: <T>(store: string, key: string) => op<T>(store, "readonly", (s) => s.get(key)),
  put: (store: string, key: string, value: unknown) => op(store, "readwrite", (s) => s.put(value, key)),
};
export const putBlob = (hash: string, blob: Blob) => idb.put("blobs", hash, blob);

export type Me = { email: string; role: string | null; team?: string }; export type Refusal = { draft: Payload; reason: string };

class Store {
  facts: Fact[] = []; queue: Draft[] = [];
  state: State = empty();
  me: Me = { email: "you@this.phone", role: "admin" };
  online = false; // true = a Team DO holds the canonical ledger; false = this phone is it
  refusals: Refusal[] = [];
  private listeners = new Set<() => void>();
  version = 0;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  private wake() { this.version++; this.state = fold(this.facts); for (const q of this.queue) apply(this.state, { ...q, seq: 0 }); for (const fn of this.listeners) fn(); }

  async boot() {
    this.facts = (await idb.get<Fact[]>("kv", "facts")) ?? [];
    this.queue = (await idb.get<Draft[]>("kv", "queue")) ?? [];
    try {
      const res = await fetch("/api/t/me");
      if (res.status === 401) { this.me = { email: "", role: null }; this.wake(); return; } // Access let us in but the worker could not verify us
      if (res.ok) { this.me = await res.json(); this.online = true; }
    } catch { /* no server: this phone is the ledger */ }
    this.wake();
    if (this.online) { await this.sync(); setInterval(() => void this.sync(), 30_000); }
    if (this.online && this.me.role === "founder" && !Object.keys(this.state.actors).length)
      this.submit([{ type: "granted", email: this.me.email, role: "admin" }]); // an empty ledger is founded by its first arrival
  }

  // The one write path. Locally guarded first, so a bad draft is refused before it queues.
  submit(payloads: Payload[], via?: "agent"): Refusal[] {
    const refused: Refusal[] = [];
    for (const p of payloads) {
      const draft: Draft = { ...p, at: Date.now(), actor: this.me.email, ...(via && { via }) };
      const reason = guard(this.state, draft);
      if (reason) { refused.push({ draft: p, reason }); continue; }
      apply(this.state, { ...draft, seq: 0 }); // so the next draft in this batch sees it; wake() refolds anyway
      this.online ? this.queue.push(draft) : this.facts.push({ ...draft, seq: this.facts.length + 1 });
    }
    this.wake();
    void this.save();
    if (this.online) void this.sync();
    return refused;
  }

  private async save() { await idb.put("kv", "facts", this.facts); await idb.put("kv", "queue", this.queue); }

  async sync() {
    try {
      if (this.queue.length) {
        const out = await fetch("/api/t/append", { method: "POST", body: JSON.stringify(this.queue.map(({ at, actor, ...p }) => p)) })
          .then((r) => r.json() as Promise<{ admitted: Fact[]; refused: Refusal[] }>);
        this.queue = [];
        this.refusals = [...this.refusals, ...out.refused]; // refused offline work is surfaced, never dropped
      }
      const head = this.facts.at(-1)?.seq ?? 0;
      const fresh = await fetch(`/api/t/pull?since=${head}`).then((r) => r.json() as Promise<Fact[]>);
      if (fresh.length || this.refusals.length) { this.facts = [...this.facts, ...fresh]; this.wake(); }
      await this.save();
    } catch { /* offline: the queue keeps everything */ }
  }

  // Local mode only: the scheduler has no cron, so the store runs the same pure plan().
  tick() { if (!this.online) { const due = plan(this.state, Date.now(), 42); if (due.length) this.submit(due); } }
}
export const store = new Store();
