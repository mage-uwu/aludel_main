import { useRef, useState, type ReactElement } from "react";
import { newId, type Block, type Cadence, type Fact, type Outcome, type Payload, type Task, type TemplateId } from "./kernel";
import { balance } from "./read";
import { seed } from "./demo";
import { store } from "./sync";

// Office mode: a conversation with the desk, and three lists. The chat is the authoring
// and dispatch surface — drafts arrive as cards and a tap commits them (via: "agent").
// The interview: fixed questions, suggested defaults, one answer per turn, a task loop —
// deterministic where the agent was chatty. The result rides the same draft card and guard.
type Wiz = { step: number; name: string; tasks: Task[]; cur: { title: string; outcomes: Outcome[]; cadence?: Cadence; blocks: Block[] } };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
const outcome = (label: string): Outcome => ({ key: slug(label), label, cost: /no.?access|skip/i.test(label) ? 0 : 1 }); // "part of a plan" is just outcome costs
const task = (title: string): Wiz["cur"] => ({ title, outcomes: [], blocks: [] });
const STEPS: { q: (w: Wiz) => string; s?: string[]; go: (w: Wiz, a: string) => number }[] = [
  { q: () => "What should the report be called?", go: (w, a) => ((w.name = a), 1) },
  { q: () => "What is the first task you do on site?", go: (w, a) => ((w.cur = task(a)), 2) },
  { q: (w) => `How can "${w.cur.title}" end?`, s: ["OK, FOLLOW-UP, NO ACCESS"], go: (w, a) => ((w.cur.outcomes = a.split(",").map((x) => outcome(x.trim())).filter((o) => o.label)), w.cur.outcomes.length ? 3 : 2) },
  { q: () => "Does it repeat? Say how often, or 'no'. (Which weekday is set per site, when you bind it.)", s: ["every 1 week", "every 2 weeks", "no"],
    go: (w, a) => { const n = a.match(/(\d+)\s*week/i); if (n) w.cur.cadence = { every: +n[1]!, unit: "week", withinDays: 7 }; return 4; } },
  { q: () => "What gets recorded on the job? One per message — like 'photo Before photos' or 'number Chlorine tabs' — then 'done'.", s: ["photo Before photos", "text Notes", "number Chlorine tabs", "done"],
    go: (w, a) => {
      const m = a.match(/^(photo|number|text)\s+(.+)/i);
      if (!m) { w.tasks.push({ key: slug(w.cur.title), ...w.cur }); return 5; }
      const [kind, label, key] = [m[1]!.toLowerCase(), m[2]!.trim(), slug(m[2]!)];
      w.cur.blocks.push(kind === "number" ? { key, kind, label, required: false, min: 0, max: 999999 } : kind === "photo" ? { key, kind, label, required: false } : { key, kind: "text", label, required: false, placeholder: "" });
      return 4;
    } },
  { q: () => "Any other tasks on site? Name one, or 'done'.", s: ["done"], go: (w, a) => (/^done\.?$/i.test(a) ? -1 : ((w.cur = task(a)), 2)) },
];

function Chat(): ReactElement {
  const [log, setLog] = useState<{ who: string; body: string }[]>([]);
  const [drafts, setDrafts] = useState<Payload[]>([]);
  const [busy, setBusy] = useState(false);
  const previous = useRef<string | undefined>(undefined); // the thread lives server-side, we hold its id
  const wiz = useRef<Wiz | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const say = (w: Wiz) => { const st = STEPS[w.step]!; setLog((l) => [...l, { who: "aludel", body: st.q(w) }, ...(st.s ? [{ who: "suggest", body: st.s.join("|") }] : [])]); };
  const send = async (text?: string) => {
    const ask = (text ?? input.current?.value ?? "").trim();
    if (!ask || busy) return;
    input.current!.value = "";
    setLog((l) => [...l, { who: "you", body: ask }]);
    if (wiz.current) { // the interview answers locally: deterministic, instant, offline-safe
      const w = wiz.current;
      const next = STEPS[w.step]!.go(w, ask);
      if (next !== -1) { w.step = next; say(w); return; }
      wiz.current = null;
      setDrafts([{ type: "signed", template: { id: newId<TemplateId>(), version: 1, name: w.name, tasks: w.tasks } }]);
      setLog((l) => [...l, { who: "aludel", body: `"${w.name}" is drafted below — commit it and it's real. Then ask me to bind it to a site.` }]);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/agent", { method: "POST", body: JSON.stringify({ text: ask, previous: previous.current }) })
        .then((r) => (r.ok ? (r.json() as Promise<{ reply: string; drafts: Payload[]; previous?: string; wizard?: boolean }>) : Promise.reject(new Error(String(r.status)))));
      previous.current = res.previous;
      setLog((l) => [...l, { who: "aludel", body: res.reply }]);
      setDrafts(res.drafts);
      if (res.wizard) { wiz.current = { step: 0, name: "", tasks: [], cur: task("") }; say(wiz.current); }
    } catch { setLog((l) => [...l, { who: "aludel", body: store.online ? "Aludel is unreachable right now." : "Aludel needs the server — this device is running standalone." }]); }
    setBusy(false);
  };
  const commit = () => {
    const refused = store.submit(drafts, "agent");
    setLog((l) => [...l, { who: "ledger", body: refused.length ? `refused: ${refused[0]!.reason}` : `${drafts.length} fact(s) appended.` }]); setDrafts([]);
  };
  return (
    <section className="chat">
      {log.map((m, i) => m.who === "suggest"
        ? <nav key={i} className="tabs chips">{m.body.split("|").map((c) => <button key={c} onClick={() => void send(c)}>{c}</button>)}</nav>
        : <p key={i} className={m.who}><b>{m.who}</b> {m.body}</p>)}
      {drafts.length > 0 && <div className="card"><b>Draft — nothing is real until you commit</b>
        <pre>{JSON.stringify(drafts, null, 1)}</pre>
        <button onClick={commit}>Commit</button><button className="ghost" onClick={() => setDrafts([])}>Discard</button></div>}
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input ref={input} placeholder={busy ? "Aludel is thinking…" : "Ask Aludel, or tell it what to set up…"} disabled={busy} />
      </form>
    </section>
  );
}

const line = (f: Fact): string =>
  f.type === "granted" ? `${f.email} granted ${f.role}` :
  f.type === "declared" ? `site declared: ${f.site.client.name}` :
  f.type === "signed" ? `template signed: ${f.template.name} v${f.template.version}` :
  f.type === "bound" ? "service bound to site" :
  f.type === "dispatched" ? `dispatched ${f.entries.length} task(s) → ${f.form.meta.name}` :
  f.type === "logged" ? `logged — ${f.outcome}` :
  f.type === "corrected" ? `corrected (${f.reason})` : `due date moved (${f.reason})`;

export default function Office(): ReactElement {
  const [tab, setTab] = useState("desk");
  const s = store.state;
  const now = Date.now();
  return (
    <section>
      <nav className="tabs">{["desk", "sites", "templates", "ledger"].map((t) => <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</nav>
      {tab === "desk" && <Chat />}
      {tab === "sites" && Object.values(s.sites).map((site) => <div key={site.id} className="card"><b>{site.client.name}</b><span>{site.client.address}{site.services[0]?.list && ` · ${site.services[0].list}`}</span>
        {site.services.flatMap((svc) => Object.keys(svc.allotments).map((task) => {
          const b = balance(s, site.id, svc.template, task, now);
          return b && <span key={task} className={b.left < 0 ? "bad" : ""}>{task}: {b.left} of {b.of} left</span>;
        }))}</div>)}
      {tab === "templates" && Object.entries(s.latest).map(([id, v]) => { const t = s.templates[`${id}@${v}`]!; return <div key={id} className="card"><b>{t.name} · v{v}</b>
        {t.tasks.map((task) => <span key={task.key}>{task.title} — {task.blocks.length} block(s), ends {task.outcomes.map((o) => o.label).join(" / ")}</span>)}</div>; })}
      {tab === "ledger" && <div>
        {store.refusals.map((r, i) => <p key={i} className="bad">refused: {r.reason}</p>)}
        {[...store.facts].reverse().slice(0, 50).map((f) => <p key={f.seq} className="row"><span className="hint">#{f.seq} {new Date(f.at).toLocaleString()} {f.actor}{f.via ? " (via agent)" : ""}</span><br />{line(f)}</p>)}
        {store.facts.length === 0 && <p className="hint">The ledger is empty. Ask the desk to set up your first template — or <button className="ghost" onClick={() => { seed(); }}>load the demo team</button>.</p>}
      </div>}
    </section>
  );
}
