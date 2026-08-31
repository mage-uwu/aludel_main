import { useEffect, useRef, useState, type ReactElement } from "react";
import { newId, type Block, type Cadence, type Fact, type Outcome, type Payload, type Task, type Template, type TemplateId } from "./kernel";
import { balance } from "./read";
import { store } from "./sync";

// Office mode: the stage holds the live form, the terminal is where you talk to Aludel.
// Both edit the same draft — the interview writes a step at a time so you watch the form
// assemble, and every field on it stays clickable, renameable, reorderable by hand. Colour
// marks provenance: violet when a model spoke, mint when the script or the ledger did.
// Nothing is real until Commit puts the draft through the guard.
type Norm = { title?: string; labels?: string[]; every?: number | null; unit?: Cadence["unit"]; day?: number; blocks?: { kind: string; label: string }[] } | null;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
const outcome = (label: string): Outcome => ({ key: slug(label), label, cost: /no.?access|skip/i.test(label) ? 0 : 1 }); // "part of a plan" is just outcome costs
const newTask = (title: string): Task => ({ key: slug(title), title, outcomes: [], blocks: [] });
const last = (t: Template) => t.tasks[t.tasks.length - 1]!;
const move = (a: Block[], i: number, by: number) => { const j = i + by; if (a[j]) [a[i], a[j]] = [a[j]!, a[i]!]; };
const block = (kind: string, label: string): Block => {
  const key = slug(label);
  return kind === "number" ? { key, kind, label, required: false, min: 0, max: 999999 }
    : kind === "photo" ? { key, kind, label, required: false } : { key, kind: "text", label, required: false, placeholder: "" };
};

// The interview: scripted questions, human answers. Each step mutates the draft the stage is
// showing, so the form grows as you talk; only the answers pass through the model.
const STEPS: { q: (t: Template) => string; hint?: (t: Template) => string; refine?: string; go: (t: Template, a: string, n: Norm) => number }[] = [
  { q: () => "What should the report be called?", refine: "title", go: (t, a, n) => ((t.name = n?.title || a), 1) },
  { q: () => "What is the first task you do on site?", refine: "task", go: (t, a, n) => (t.tasks.push(newTask(n?.title || a)), 2) },
  { q: (t) => `How can "${last(t).title}" end?`, hint: () => "OK, FOLLOW-UP, NO ACCESS", refine: "outcomes",
    go: (t, a, n) => ((last(t).outcomes = (n?.labels ?? a.split(",").map((x) => x.trim())).map(outcome).filter((o) => o.label)), last(t).outcomes.length ? 3 : 2) },
  { q: () => "Does it repeat? Say how often, or 'no'.", hint: () => "every 1 week", refine: "cadence",
    go: (t, a, n) => { const m = a.match(/(\d+)\s*(day|week|month)/i);
      if (m) last(t).cadence = { every: +m[1]!, unit: m[2]!.toLowerCase() as Cadence["unit"], withinDays: 7 };
      else if (n?.every) last(t).cadence = { every: n.every, unit: n.unit ?? "week", withinDays: 7 };
      return last(t).cadence ? 4 : 5; } }, // repeats → ask the day; one-off → straight to the fields
  { q: (t) => `What day does "${last(t).title}" usually go out? (A site can override when you bind it.)`, hint: () => "Monday", refine: "day",
    go: (t, a, n) => { const d = n?.day ?? DAYS.findIndex((x) => new RegExp(x, "i").test(a)); const c = last(t).cadence; if (c && d >= 0) c.day = d; return 5; } },
  { q: (t) => last(t).blocks.length ? "More? Or 'done'." : "What gets recorded on the job? Photos, numbers, notes — list it all, then 'done'.",
    hint: (t) => (last(t).blocks.length ? "done" : "Before photos, Notes"), refine: "blocks",
    go: (t, a, n) => {
      if (/^done\.?$/i.test(a.trim())) return 6;
      const m = a.match(/^(photo|number|text)\s+(.+)/i); // an explicit kind is an instruction, not a hint
      for (const b of m ? [{ kind: m[1]!.toLowerCase(), label: m[2]!.trim() }] : n?.blocks ?? [{ kind: "text", label: a }]) last(t).blocks.push(block(b.kind, b.label));
      return 5; } },
  { q: () => "Any other tasks on site? Name one, or 'done'.", hint: () => "done", refine: "task",
    go: (t, a, n) => (/^done\.?$/i.test(a.trim()) ? -1 : (t.tasks.push(newTask(n?.title || a)), 2)) },
];

// The form on the stage. Read-only in the Templates tab; with `edit`, every label is a pencil
// and every field can be moved or dropped — the same surface Aludel writes into.
const Form = ({ t, edit }: { t: Template; edit?: (f: (d: Template) => void) => void }): ReactElement => (
  <article className="tpl">
    {edit ? <input className="pencil name" value={t.name} placeholder="Report name" onChange={(e) => edit((d) => { d.name = e.target.value; })} /> : <h3>{t.name} <span className="v">v{t.version}</span></h3>}
    {t.tasks.map((k, ti) => <div className="task" key={ti}>
      {edit ? <input className="pencil" value={k.title} onChange={(e) => edit((d) => { d.tasks[ti]!.title = e.target.value; })} /> : <b>{k.title}</b>}
      {k.cadence && <em>every {k.cadence.every} {k.cadence.unit}{k.cadence.day !== undefined && ` · ${DAYS[k.cadence.day]}days`}</em>}
      {k.blocks.map((b, bi) => <div className="brow" key={bi}><i>{b.kind}</i>
        {edit ? <input className="pencil" value={b.label} onChange={(e) => edit((d) => { d.tasks[ti]!.blocks[bi]!.label = e.target.value; })} /> : <span>{b.label}</span>}
        {edit && <><button title="Move up" disabled={bi === 0} onClick={() => edit((d) => move(d.tasks[ti]!.blocks, bi, -1))}>↑</button>
          <button title="Move down" disabled={bi === k.blocks.length - 1} onClick={() => edit((d) => move(d.tasks[ti]!.blocks, bi, 1))}>↓</button>
          <button title="Remove" onClick={() => edit((d) => { d.tasks[ti]!.blocks.splice(bi, 1); })}>✕</button></>}
      </div>)}
      {edit && <button className="add" onClick={() => edit((d) => { d.tasks[ti]!.blocks.push(block("text", "New field")); })}>+ field</button>}
      <p className="outs">{k.outcomes.map((o, oi) => edit ? <input key={oi} className="pencil out" value={o.label} onChange={(e) => edit((d) => { const x = d.tasks[ti]!.outcomes[oi]!; x.label = e.target.value; x.key = slug(x.label); })} /> : <span key={oi}>{o.label}</span>)}</p>
    </div>)}
  </article>
);

const line = (f: Fact): string =>
  f.type === "granted" ? `${f.email} granted ${f.role}` : f.type === "declared" ? `site declared: ${f.site.client.name}` :
  f.type === "signed" ? `template signed: ${f.template.name} v${f.template.version}` : f.type === "bound" ? "service bound to site" :
  f.type === "dispatched" ? `dispatched ${f.entries.length} task(s) → ${f.form.meta.name}` : f.type === "logged" ? `logged — ${f.outcome}` :
  f.type === "corrected" ? `corrected (${f.reason})` : `due date moved (${f.reason})`;

export default function Office(): ReactElement {
  const [log, setLog] = useState([{ who: "step", body: "Aludel ready. Ask for a new report, or ask about the work." }]); const [tab, setTab] = useState("templates");
  const [draft, setDraft] = useState<Template | null>(null); const [drafts, setDrafts] = useState<Payload[]>([]);
  const [step, setStep] = useState(-1); const [busy, setBusy] = useState(false); const [hint, setHint] = useState("");
  const previous = useRef<string | undefined>(undefined); // the agent thread lives server-side; the interview lives here
  const input = useRef<HTMLInputElement>(null); const tail = useRef<HTMLDivElement>(null); const stage = useRef<HTMLDivElement>(null);
  useEffect(() => { tail.current?.scrollTo({ top: 1e7 }); if (step >= 0) stage.current?.scrollTo({ top: 1e7, behavior: "smooth" }); }, [log, busy, draft, step]); // the stage follows what Aludel just wrote
  const edit = (f: (d: Template) => void) => setDraft((d) => { if (!d) return d; const c = structuredClone(d); f(c); return c; });
  const say = (i: number, t: Template) => { const st = STEPS[i]!; setLog((l) => [...l, { who: "step", body: st.q(t) }]); setHint(st.hint?.(t) ?? ""); }; // scripted lines speak mint
  const send = async (text?: string) => {
    const ask = (text ?? input.current?.value ?? "").trim() || (step >= 0 ? hint : "");
    if (!ask || busy) return;
    input.current!.value = "";
    setLog((l) => [...l, { who: "you", body: ask }]);
    if (step >= 0 && draft) { // scripted flow; the model only normalizes the answer
      const st = STEPS[step]!;
      setBusy(true);
      const n: Norm = st.refine && !/^done\.?$/i.test(ask) && store.online
        ? await fetch("/api/refine", { method: "POST", body: JSON.stringify({ kind: st.refine, text: ask }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      setBusy(false);
      const t = structuredClone(draft); const next = st.go(t, ask, n);
      setDraft(t); setStep(next);
      if (next >= 0) say(next, t);
      else { setHint(""); setLog((l) => [...l, { who: "step", body: `"${t.name}" is on the stage — tweak anything, then commit it.` }]); }
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/agent", { method: "POST", body: JSON.stringify({ text: ask, previous: previous.current }) })
        .then((r) => (r.ok ? (r.json() as Promise<{ reply: string; drafts: Payload[]; previous?: string; wizard?: boolean }>) : Promise.reject(new Error(String(r.status)))));
      previous.current = res.previous;
      setLog((l) => [...l, { who: "aludel", body: res.reply }]);
      setDrafts(res.drafts);
      if (res.wizard) { const t: Template = { id: newId<TemplateId>(), version: 1, name: "", tasks: [] }; setDraft(t); setStep(0); say(0, t); }
    } catch { setLog((l) => [...l, { who: "err", body: store.online ? "Aludel is unreachable right now." : "Aludel needs the server — this device is standalone." }]); }
    setBusy(false);
  };
  const commit = () => { const no = store.submit(draft ? [{ type: "signed", template: draft }] : drafts, "agent");
    setLog((l) => [...l, { who: no.length ? "err" : "ledger", body: no.length ? `refused: ${no[0]!.reason}` : "appended to the ledger." }]);
    if (!no.length) { setDraft(null); setDrafts([]); setStep(-1); setHint(""); } };
  const s = store.state; const now = Date.now(); const live = draft || drafts.length > 0;
  return (
    <div className="pane">
      <section className="stage">
        <nav className="tabs">{live // while a draft is live the bar belongs to it: the commit is never scrolled away
          ? <><b>{step >= 0 ? "Aludel is building…" : "Draft · uncommitted"}</b><button className="go" onClick={commit}>Commit</button>
            <button className="ghost" onClick={() => { setDraft(null); setDrafts([]); setStep(-1); setHint(""); }}>Discard</button></>
          : ["templates", "sites", "ledger"].map((t) => <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</nav>
        <div className="scroll" ref={stage}>
          {live ? <div className="draft">
            {draft && <Form t={draft} edit={edit} />}
            {drafts.map((d, i) => <pre key={i} className="card">{JSON.stringify(d, null, 1)}</pre>)}</div> : <>
          {tab === "templates" && (Object.keys(s.latest).length ? Object.entries(s.latest).map(([id, v]) => <Form key={id} t={s.templates[`${id}@${v}`]!} />) : <p className="empty">No reports yet. Ask Aludel below for a new one.</p>)}
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
