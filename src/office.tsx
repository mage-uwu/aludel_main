import { useEffect, useRef, useState, type ReactElement } from "react";
import { newId, type Block, type Cadence, type Fact, type Outcome, type Payload, type Task, type Template, type TemplateId } from "./kernel";
import { balance } from "./read";
import { store } from "./sync";

// Office mode: the stage shows what you are looking at, the terminal is where you talk to
// Aludel. Colour marks provenance — violet when a model spoke, mint when the script or the
// ledger did. The interview's questions are scripted and only its answers pass through the
// model (/api/refine), with the local parse as offline fallback; drafts land on the stage,
// and nothing is real until Commit puts them through the guard.
type Wiz = { step: number; name: string; tasks: Task[]; cur: { title: string; outcomes: Outcome[]; cadence?: Cadence; blocks: Block[] } };
type Norm = { title?: string; labels?: string[]; every?: number | null; unit?: Cadence["unit"]; blocks?: { kind: string; label: string }[] } | null;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
const outcome = (label: string): Outcome => ({ key: slug(label), label, cost: /no.?access|skip/i.test(label) ? 0 : 1 }); // "part of a plan" is just outcome costs
const task = (title: string): Wiz["cur"] => ({ title, outcomes: [], blocks: [] });
const block = (kind: string, label: string): Block => {
  const key = slug(label);
  return kind === "number" ? { key, kind, label, required: false, min: 0, max: 999999 }
    : kind === "photo" ? { key, kind, label, required: false } : { key, kind: "text", label, required: false, placeholder: "" };
};
const STEPS: { q: (w: Wiz) => string; hint?: (w: Wiz) => string; refine?: string; go: (w: Wiz, a: string, n: Norm) => number }[] = [
  { q: () => "What should the report be called?", refine: "title", go: (w, a, n) => ((w.name = n?.title || a), 1) },
  { q: () => "What is the first task you do on site?", refine: "task", go: (w, a, n) => ((w.cur = task(n?.title || a)), 2) },
  { q: (w) => `How can "${w.cur.title}" end?`, hint: () => "OK, FOLLOW-UP, NO ACCESS", refine: "outcomes",
    go: (w, a, n) => ((w.cur.outcomes = (n?.labels ?? a.split(",").map((x) => x.trim())).map(outcome).filter((o) => o.label)), w.cur.outcomes.length ? 3 : 2) },
  { q: () => "Does it repeat? Say how often, or 'no'. (Which weekday is set per site, when you bind it.)", hint: () => "every 1 week", refine: "cadence",
    go: (w, a, n) => { const m = a.match(/(\d+)\s*week/i); if (m) w.cur.cadence = { every: +m[1]!, unit: "week", withinDays: 7 }; else if (n?.every) w.cur.cadence = { every: n.every, unit: n.unit ?? "week", withinDays: 7 }; return 4; } },
  { q: (w) => w.cur.blocks.length ? `Got ${w.cur.blocks.map((b) => `${b.label} (${b.kind})`).join(", ")}. More? Or 'done'.` : "What gets recorded on the job? Photos, numbers, notes — list it all, then 'done'.",
    hint: (w) => (w.cur.blocks.length ? "done" : "Before photos, Notes"), refine: "blocks",
    go: (w, a, n) => {
      if (/^done\.?$/i.test(a.trim())) { w.tasks.push({ key: slug(w.cur.title), ...w.cur }); return 5; }
      const m = a.match(/^(photo|number|text)\s+(.+)/i);
      for (const b of n?.blocks ?? (m ? [{ kind: m[1]!.toLowerCase(), label: m[2]!.trim() }] : [{ kind: "text", label: a }])) w.cur.blocks.push(block(b.kind, b.label));
      return 4;
    } },
  { q: () => "Any other tasks on site? Name one, or 'done'.", hint: () => "done", refine: "task", go: (w, a, n) => (/^done\.?$/i.test(a.trim()) ? -1 : ((w.cur = task(n?.title || a)), 2)) },
];

const Preview = ({ t }: { t: Template }): ReactElement => (
  <article className="tpl">
    <h3>{t.name} <span className="v">v{t.version}</span></h3>
    {t.tasks.map((k) => <div className="task" key={k.key}><b>{k.title}</b>{k.cadence && <em>every {k.cadence.every} {k.cadence.unit}</em>}
      <p className="blocks">{k.blocks.length ? k.blocks.map((b) => <span key={b.key}>{b.label}<i>{b.kind}</i></span>) : "nothing recorded"}</p>
      <p className="outs">{k.outcomes.map((o) => <span key={o.key}>{o.label}</span>)}</p></div>)}
  </article>
);

const line = (f: Fact): string =>
  f.type === "granted" ? `${f.email} granted ${f.role}` :
  f.type === "declared" ? `site declared: ${f.site.client.name}` :
  f.type === "signed" ? `template signed: ${f.template.name} v${f.template.version}` :
  f.type === "bound" ? "service bound to site" :
  f.type === "dispatched" ? `dispatched ${f.entries.length} task(s) → ${f.form.meta.name}` :
  f.type === "logged" ? `logged — ${f.outcome}` :
  f.type === "corrected" ? `corrected (${f.reason})` : `due date moved (${f.reason})`;

export default function Office(): ReactElement {
  const [log, setLog] = useState([{ who: "step", body: "Aludel ready. Ask for a new report, or ask about the work." }]); const [tab, setTab] = useState("templates");
  const [drafts, setDrafts] = useState<Payload[]>([]); const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(""); // the ghost on the line: Enter accepts it, typing overrules it, Tab fills it
  const previous = useRef<string | undefined>(undefined); const wiz = useRef<Wiz | null>(null); // the agent thread lives server-side; the interview lives here
  const input = useRef<HTMLInputElement>(null); const tail = useRef<HTMLDivElement>(null);
  useEffect(() => { tail.current?.scrollTo({ top: 1e7 }); }, [log, busy]);
  const say = (w: Wiz) => { const st = STEPS[w.step]!; setLog((l) => [...l, { who: "step", body: st.q(w) }]); setHint(st.hint?.(w) ?? ""); }; // scripted lines speak mint
  const send = async (text?: string) => {
    const ask = (text ?? input.current?.value ?? "").trim() || (wiz.current ? hint : "");
    if (!ask || busy) return;
    input.current!.value = "";
    setLog((l) => [...l, { who: "you", body: ask }]);
    if (wiz.current) { // scripted flow; the model only normalizes the answer
      const w = wiz.current; const st = STEPS[w.step]!;
      setBusy(true);
      const n: Norm = st.refine && !/^done\.?$/i.test(ask) && store.online
        ? await fetch("/api/refine", { method: "POST", body: JSON.stringify({ kind: st.refine, text: ask }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      setBusy(false);
      const next = st.go(w, ask, n);
      if (next !== -1) { w.step = next; say(w); return; }
      wiz.current = null; setHint("");
      setDrafts([{ type: "signed", template: { id: newId<TemplateId>(), version: 1, name: w.name, tasks: w.tasks } }]);
      setLog((l) => [...l, { who: "step", body: `"${w.name}" is on the stage — commit it and it's real.` }]);
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
    } catch { setLog((l) => [...l, { who: "err", body: store.online ? "Aludel is unreachable right now." : "Aludel needs the server — this device is standalone." }]); }
    setBusy(false);
  };
  const commit = () => { const no = store.submit(drafts, "agent"); setDrafts([]);
    setLog((l) => [...l, { who: no.length ? "err" : "ledger", body: no.length ? `refused: ${no[0]!.reason}` : `${drafts.length} fact(s) appended.` }]); };
  const s = store.state; const now = Date.now();
  return (
    <div className="pane">
      <section className="stage">
        <nav className="tabs">{["templates", "sites", "ledger"].map((t) => <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</nav>
        <div className="scroll">
          {drafts.length > 0 ? <div className="draft">
            <header><h2>Draft · uncommitted</h2><button className="go" onClick={commit}>Commit</button><button className="ghost" onClick={() => setDrafts([])}>Discard</button></header>
            {drafts.map((d, i) => d.type === "signed" ? <Preview key={i} t={d.template} /> : <pre key={i} className="card">{JSON.stringify(d, null, 1)}</pre>)}</div> : <>

          {tab === "templates" && (Object.keys(s.latest).length ? Object.entries(s.latest).map(([id, v]) => <Preview key={id} t={s.templates[`${id}@${v}`]!} />) : <p className="empty">No reports yet. Ask Aludel below for a new one.</p>)}
          {tab === "sites" && Object.values(s.sites).map((site) => <div key={site.id} className="card"><b>{site.client.name}</b>
            <span>{site.client.address}{site.services[0]?.list && ` · ${site.services[0].list}`}</span>
            {site.services.flatMap((svc) => Object.keys(svc.allotments).map((k) => { const b = balance(s, site.id, svc.template, k, now); return b && <span key={k} className={b.left < 0 ? "bad" : ""}>{k}: {b.left} of {b.of} left</span>; }))}</div>)}
          {tab === "ledger" && store.refusals.map((r, i) => <p key={i} className="row bad">refused: {r.reason}</p>)}
          {tab === "ledger" && [...store.facts].reverse().slice(0, 60).map((f) => <p key={f.seq} className="row"><span className="hint">#{f.seq} · {new Date(f.at).toLocaleString()} · {f.actor}{f.via ? " · via agent" : ""}</span><br />{line(f)}</p>)}
          {tab === "ledger" && !store.facts.length && <p className="empty">The ledger is empty.</p>}
          {tab === "sites" && !Object.keys(s.sites).length && <p className="empty">No sites yet. Ask Aludel to add one.</p>}</>}
        </div>
      </section>
      <section className="term">
        <div className="log" ref={tail}>
          {log.map((m, i) => <p key={i} className={m.who}><b>{m.who}</b><span>{m.body}</span></p>)}
          {busy && <p className="step"><b>aludel</b><span>…</span></p>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input ref={input} placeholder={hint || "Ask Aludel, or tell it what to set up…"} disabled={busy}
            onKeyDown={(e) => { if (e.key === "Tab" && hint && !e.currentTarget.value) { e.preventDefault(); e.currentTarget.value = hint; } }} />
        </form>
      </section>
    </div>
  );
}
