import { useEffect, useRef, useState, type ReactElement } from "react";
import { newId, type Block, type Cadence, type Fact, type Outcome, type Payload, type Task, type Template, type TemplateId } from "./kernel";
import { Input } from "./field";
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
const outcome = (label: string): Outcome => ({ key: slug(label), label: label.replace(/_+/g, " ").trim(), cost: /no.?access|skip/i.test(label) ? 0 : 1 }); // "part of a plan" is just outcome costs
const newTask = (title: string): Task => ({ key: slug(title), title, outcomes: [], blocks: [] });
const last = (t: Template) => t.tasks[t.tasks.length - 1]!;
const move = (a: Block[], i: number, by: number) => { const j = i + by; if (a[j]) [a[i], a[j]] = [a[j]!, a[i]!]; };
const block = (kind: string, label: string): Block => {
  const key = slug(label); label = label.replace(/_+/g, " ").trim() || label;
  return kind === "number" ? { key, kind, label, required: false, min: 0, max: 999999 }
    : kind === "photo" ? { key, kind, label, required: false } : { key, kind: "text", label, required: false, placeholder: "" };
};

// The interview: scripted questions, human answers. Each step mutates the draft the stage is
// showing, so the form grows as you talk; only the answers pass through the model.
const STEPS: { q: (t: Template) => string; hint?: (t: Template) => string; refine?: string; go: (t: Template, a: string, n: Norm) => number }[] = [
  { q: () => "What should the report be called?", refine: "title", go: (t, a, n) => ((t.name = n?.title || a), 1) },
  { q: (t) => t.tasks.length ? "What's the new task called?" : "What is the first task you do on site?", refine: "task", go: (t, a, n) => (t.tasks.push(newTask(n?.title || a)), 2) },
  { q: (t) => `How can "${last(t).title}" end?`, hint: () => "OK, FOLLOW-UP, NO ACCESS", refine: "outcomes", go: (t, a, n) => ((last(t).outcomes = (n?.labels ?? a.split(",").map((x) => x.trim())).map(outcome).filter((o) => o.label)), last(t).outcomes.length ? 3 : 2) },
  { q: () => "Does it repeat? Say how often, or 'no'.", hint: () => "every 1 week", refine: "cadence", go: (t, a, n) => { const m = a.match(/(\d+)\s*(day|week|month)/i);
      if (m) last(t).cadence = { every: +m[1]!, unit: m[2]!.toLowerCase() as Cadence["unit"], withinDays: 7 }; else if (n?.every) last(t).cadence = { every: n.every, unit: n.unit ?? "week", withinDays: 7 };
      return last(t).cadence ? 4 : 5; } }, // repeats → ask the day; one-off → straight to the fields
  { q: (t) => `What day does "${last(t).title}" usually go out? (A site can override when you bind it.)`, hint: () => "Monday", refine: "day", go: (t, a, n) => { const d = n?.day ?? DAYS.findIndex((x) => new RegExp(x, "i").test(a)); const c = last(t).cadence; if (c && d >= 0) c.day = d; return 5; } },
  { q: (t) => last(t).blocks.length ? "More? Or 'done'." : "What gets recorded on the job? Photos, numbers, notes — list it all, then 'done'.",
    hint: (t) => (last(t).blocks.length ? "done" : "Before photos, Notes"), refine: "blocks",
    go: (t, a, n) => {
      if (/^done\.?$/i.test(a.trim())) return 6; const m = a.match(/^(photo|number|text)\s+(.+)/i); // an explicit kind is an instruction, not a hint
      for (const b of m ? [{ kind: m[1]!.toLowerCase(), label: m[2]!.trim() }] : n?.blocks ?? [{ kind: "text", label: a }]) last(t).blocks.push(block(b.kind, b.label)); return 5; } },
  { q: () => "Any other tasks on site? Name one, or 'done'.", hint: () => "done", refine: "task",
    go: (t, a, n) => (/^done\.?$/i.test(a.trim()) ? -1 : (t.tasks.push(newTask(n?.title || a)), 2)) },
];

const zz = (ms: number) => new Promise((ok) => setTimeout(ok, ms)); type Act = { sel: string; go: (d: Template) => void };
// The hand's script: what changed between two drafts, as the edits a person would make. Each
// action names the control it uses — the + field button, a block's ✕, a pencil — so the cursor
// can go press it. Reorders and rarities fall through to the final snap; nothing is ever lost.
const acts = (a: Template, b: Template): Act[] => {
  const out: Act[] = []; const J = JSON.stringify;
  if (a.name !== b.name) out.push({ sel: ".pencil.name", go: (d) => { d.name = b.name; } });
  b.tasks.forEach((t, i) => {
    const p = a.tasks[i] ?? { ...t, cadence: undefined, outcomes: [], blocks: [] }; const S = `.task:nth-of-type(${i + 1})`; const n = Math.min(p.blocks.length, t.blocks.length);
    if (!a.tasks[i]) out.push({ sel: ".tpl", go: (d) => { d.tasks[i] = { ...t, cadence: undefined, outcomes: [], blocks: [] }; } });
    else if (p.title !== t.title) out.push({ sel: `${S} > .pencil`, go: (d) => { d.tasks[i]!.title = t.title; } });
    if (J(p.cadence) !== J(t.cadence)) out.push({ sel: S, go: (d) => { d.tasks[i]!.cadence = t.cadence; } });
    if (J(p.outcomes) !== J(t.outcomes)) out.push({ sel: `${S} .ends`, go: (d) => { d.tasks[i]!.outcomes = t.outcomes; } });
    t.blocks.slice(0, n).forEach((k, j) => J(p.blocks[j]) !== J(k) && out.push({ sel: `${S} div:nth-of-type(${j + 1}) .pencil`, go: (d) => { d.tasks[i]!.blocks[j] = k; } }));
    for (let j = p.blocks.length - 1; j >= n; j--) out.push({ sel: `${S} div:nth-of-type(${j + 1}) [title="Remove"]`, go: (d) => { d.tasks[i]!.blocks.splice(j, 1); } });
    t.blocks.slice(n).forEach((k) => out.push({ sel: `${S} .add`, go: (d) => { d.tasks[i]!.blocks.push(k); } }));
  }); return out; };

// The form on the stage. Read-only in the Templates tab; with `edit`, every label is a pencil
// and every field can be moved or dropped — the same surface Aludel writes into.
const Form = ({ t, edit }: { t: Template; edit?: (f: (d: Template) => void) => void }): ReactElement => (
  <article className="tpl">
    {edit ? <input className="pencil name" value={t.name} placeholder="Report name" onChange={(e) => edit((d) => { d.name = e.target.value; })} /> : <h3>{t.name} <span className="v">v{t.version}</span></h3>}
    {t.tasks.map((k, ti) => <div className="task" key={ti}>
      {edit ? <input className="pencil" value={k.title} onChange={(e) => edit((d) => { d.tasks[ti]!.title = e.target.value; })} /> : <b>{k.title}</b>}
      {k.cadence && <em>every {k.cadence.every} {k.cadence.unit}{k.cadence.day !== undefined && ` · ${DAYS[k.cadence.day]}days`}</em>}
      {k.blocks.map((b, bi) => <div className="wrap" key={bi}>
        <Input b={b} label={edit ? <input className="pencil" value={b.label} onChange={(e) => edit((d) => { d.tasks[ti]!.blocks[bi]!.label = e.target.value; })} /> : undefined} />
        {edit && <span className="tools"><button title="Move up" disabled={bi === 0} onClick={() => edit((d) => move(d.tasks[ti]!.blocks, bi, -1))}>↑</button>
          <button title="Move down" disabled={bi === k.blocks.length - 1} onClick={() => edit((d) => move(d.tasks[ti]!.blocks, bi, 1))}>↓</button><button title="Remove" onClick={() => edit((d) => { d.tasks[ti]!.blocks.splice(bi, 1); })}>✕</button></span>}
      </div>)}
      {edit && <button className="add" onClick={() => edit((d) => { d.tasks[ti]!.blocks.push(block("text", "New field")); })}>+ field</button>}<footer className="ends"><span className="hint">ends with</span>{k.outcomes.map((o, oi) => edit ? <input key={oi} className="outcome pencil" value={o.label} onChange={(e) => edit((d) => { const x = d.tasks[ti]!.outcomes[oi]!; x.label = e.target.value; x.key = slug(x.label); })} /> : <span key={oi} className="outcome">{o.label.replace(/_+/g, " ")}</span>)}</footer>
    </div>)}
  </article>
);

const line = (f: Fact): string =>
  f.type === "granted" ? `${f.email} granted ${f.role}` : f.type === "declared" ? `site declared: ${f.site.client.name}` : f.type === "signed" ? (f.template.retired ? `retired "${f.template.name}" — no new work will be planned from it` : `template signed: ${f.template.name} v${f.template.version}`) : f.type === "bound" ? "service bound to site" :
  f.type === "dispatched" ? `dispatched ${f.entries.length} task(s) → ${f.form.meta.name}` : f.type === "logged" ? `logged — ${f.outcome}` : f.type === "corrected" ? `corrected (${f.reason})` : f.type === "steered" ? `due date moved (${f.reason})` : (f as { type: string }).type;

export default function Office(): ReactElement {
  const [log, setLog] = useState([{ who: "step", body: "Aludel ready. Ask for a new report, or ask about the work." }]); const [tab, setTab] = useState("templates");
  const [draft, setDraft] = useState<Template | null>(null); const [drafts, setDrafts] = useState<Payload[]>([]);
  const [step, setStep] = useState(-1); const [busy, setBusy] = useState(false); const [hint, setHint] = useState("");
  const [wide, setWide] = useState(() => localStorage.getItem("wide") ?? "stage"); // which pane gets φ's long side
  const win = (w: string) => { setWide(w); localStorage.setItem("wide", w); };
  const previous = useRef<string | undefined>(undefined); // the agent thread lives server-side; the interview lives here
  const input = useRef<HTMLInputElement>(null); const tail = useRef<HTMLDivElement>(null); const stage = useRef<HTMLDivElement>(null); const hand = useRef<HTMLDivElement>(null);
  useEffect(() => { tail.current?.scrollTo({ top: 1e7 }); if (step >= 0 && !busy) stage.current?.scrollTo({ top: 1e7, behavior: "smooth" }); }, [log, busy, draft, step]); // the stage follows what Aludel just wrote
  const edit = (f: (d: Template) => void) => setDraft((d) => { if (!d) return d; const c = structuredClone(d); f(c); return c; });
  // The hand plays each edit where its control lives — glide, tap, land — busy the whole while so
  // nobody edits under it. The final snap makes the outcome exact even if a selector misses.
  const perform = async (list: Act[], final: Template) => {
    setBusy(true); const h = hand.current;
    for (const a of matchMedia("(prefers-reduced-motion: reduce)").matches ? [] : list) {
      const el = stage.current?.querySelector(a.sel) ?? stage.current?.querySelector(".tpl");
      if (el && h) { el.scrollIntoView({ block: "center", behavior: "smooth" }); await zz(320);
        const r = el.getBoundingClientRect(), s = stage.current!.parentElement!.getBoundingClientRect();
        Object.assign(h.style, { opacity: "1", left: `${Math.min(r.left - s.left + Math.min(r.width / 2, 90), s.width - 30)}px`, top: `${Math.max(16, Math.min(r.top - s.top + r.height / 2, s.height - 16))}px` });
        await zz(420); h.classList.add("tap"); await zz(140); }
      setDraft((d) => { const c = structuredClone(d ?? final); a.go(c); return c; }); h?.classList.remove("tap"); await zz(300); }
    if (h) h.style.opacity = "0";
    setDraft(final); setBusy(false); };
  const say = (i: number, t: Template) => { const st = STEPS[i]!; setLog((l) => [...l, { who: "step", body: st.q(t) }]); setHint(st.hint?.(t) ?? ""); }; // scripted lines speak mint
  const wizard = (id?: string) => { const v = id ? store.state.latest[id as TemplateId] : undefined; // an id means: add a task to that template, as its next version
    const t: Template = v ? { ...structuredClone(store.state.templates[`${id}@${v}`]!), version: v + 1 } : { id: newId<TemplateId>(), version: 1, name: "", tasks: [] };
    const at = t.version > 1 ? 1 : 0; setDraft(t); setStep(at); say(at, t); };
  const dead = drafts.flatMap((d) => (d.type === "signed" && d.template.retired ? [d.template.name] : []))[0]; // a staged retirement escalates: the prompt, not the button
  const send = async (text?: string) => {
    const ask = (text ?? input.current?.value ?? "").trim() || (step >= 0 ? hint : "");
    if (!ask || busy) return;
    input.current!.value = ""; setLog((l) => [...l, { who: "you", body: ask }]);
    if (dead) return void (/^y(es)?$/i.test(ask) ? commit() : setLog((l) => [...l, { who: "err", body: `Type YES to retire "${dead}", or press Discard. Logged work is kept either way.` }]));
    if (step >= 0 && draft) { // scripted flow; the model only normalizes the answer
      const st = STEPS[step]!; setBusy(true);
      const n: Norm = st.refine && !/^done\.?$/i.test(ask) && store.online ? await fetch("/api/refine", { method: "POST", body: JSON.stringify({ kind: st.refine, text: ask }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      const t = structuredClone(draft); const next = st.go(t, ask, n);
      await perform(acts(draft, t), t); setStep(next); if (next >= 0) say(next, t);
      else { setHint(""); setLog((l) => [...l, { who: "step", body: `"${t.name}" is on the stage — tweak anything, then commit it.` }]); }
      return;
    }
    if (/\b(?:new|add|another|next)\b.*\btask\b/i.test(ask) && (draft || Object.keys(store.state.latest).length < 2)) {
      if (draft) { setStep(1); say(1, draft); } else wizard(Object.keys(store.state.latest)[0]); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/agent", { method: "POST", body: JSON.stringify({ text: ask, previous: previous.current, view: { tab, draft, drafts } }) }).then((r) => (r.ok ? (r.json() as Promise<{ reply: string; drafts: Payload[]; previous?: string; wizard?: boolean | string }>) : Promise.reject(new Error(String(r.status)))));
      previous.current = res.previous; setLog((l) => [...l, { who: "aludel", body: res.reply }]);
      const d0 = res.drafts[0]; const sg = res.drafts.length === 1 && d0?.type === "signed" && !d0.template.retired ? d0.template : null;
      if (sg) { const from = draft?.id === sg.id ? draft : store.state.latest[sg.id] ? structuredClone(store.state.templates[`${sg.id}@${store.state.latest[sg.id]}`]!) : { ...sg, name: "", tasks: [] }; // an edit plays as the diff from the stage draft if one is open, else the live version; a new report builds from nothing
        setDraft({ ...structuredClone(from), id: sg.id, version: sg.version }); await perform(acts(from, sg), sg); } else setDrafts(res.drafts);
      if (res.wizard) wizard(typeof res.wizard === "string" ? res.wizard : undefined);
    } catch { setLog((l) => [...l, { who: "err", body: store.online ? "Aludel is unreachable right now." : "Aludel needs the server — this device is standalone." }]); }
    setBusy(false);
  };
  const clear = () => { setDraft(null); setDrafts([]); setStep(-1); setHint(""); };
  const commit = () => { const no = store.submit(draft ? [{ type: "signed", template: draft }] : drafts, "agent"); setLog((l) => [...l, { who: no.length ? "err" : "ledger", body: no.length ? `refused: ${no[0]!.reason}` : "appended to the ledger." }]); if (!no.length) clear(); };
  const s = store.state, now = Date.now(), live = draft || drafts.length > 0;
  return (
    <section className={`term wide-${wide}`}>
      <section className="stage">
        <nav className="tabs">{live // while a draft is live the bar belongs to it: the commit is never scrolled away
          ? <><b>{step >= 0 ? "Aludel is building…" : "Draft · uncommitted"}</b><button className="go" onClick={commit} disabled={busy || !!dead}>Commit</button>
            <button className="ghost" onClick={clear} disabled={busy}>Discard</button></>
          : ["templates", "sites", "ledger"].map((t) => <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
          <button className="win" title={wide === "min" ? "Restore" : "Minimize"} onClick={() => win(wide === "min" ? "stage" : "min")}>{wide === "min" ? "▣" : "—"}</button>
          <button className="win" title={wide === "stage" ? "Shrink" : "Maximize"} onClick={() => win(wide === "stage" ? "term" : "stage")}>▢</button></nav>
        <div className="scroll" ref={stage}>
          {live ? <div className="draft">
            {draft && <Form t={draft} edit={edit} />}
            {drafts.map((d, i) => <div key={i} className={dead ? "card bad" : "card"}><b>{line({ ...d, seq: 0, at: 0, actor: "" } as Fact)}</b>
              <span>{dead ? "Type YES below to confirm — nothing already logged is deleted." : "Commit makes it real; Discard throws it away."}</span></div>)}</div> : <>
          {tab === "templates" && (() => { const live = Object.entries(s.latest).map(([id, v]) => s.templates[`${id}@${v}`]!).filter((t) => !t.retired);
            return live.length ? live.map((t) => <Form key={t.id} t={t} />) : <p className="empty">No reports yet. Ask Aludel below for a new one.</p>; })()}
          {tab === "sites" && (Object.keys(s.sites).length ? Object.values(s.sites).map((site) => <div key={site.id} className="card"><b>{site.client.name}</b>
            <span>{site.client.address}{site.services[0]?.list && ` · ${site.services[0].list}`}</span>
            {site.services.flatMap((svc) => Object.keys(svc.allotments).map((k) => { const b = balance(s, site.id, svc.template, k, now); return b && <span key={k} className={b.left < 0 ? "bad" : ""}>{k.replace(/_+/g, " ")}: {b.left} of {b.of} left</span>; }))}</div>)
            : <p className="empty">No sites yet. Ask Aludel to add one.</p>)}
          {tab === "ledger" && store.refusals.map((r, i) => <p key={i} className="row bad">refused: {r.reason}</p>)}
          {tab === "ledger" && [...store.facts].reverse().slice(0, 60).map((f) => <p key={f.seq} className="row"><span className="hint">#{f.seq} · {new Date(f.at).toLocaleString()} · {f.actor}{f.via ? " · via agent" : ""}</span><br />{line(f)}</p>)}
          {tab === "ledger" && !store.facts.length && <p className="empty">The ledger is empty.</p>}</>}
        </div>
        <div className="hand" ref={hand} />
      </section>
      <button className="grip" title={wide === "term" ? "Give the form more room" : "Give the conversation more room"} onClick={() => win(wide === "term" ? "stage" : "term")} />
      <div className="log" ref={tail}>
        {log.map((m, i) => <p key={i} className={m.who}><b>{m.who}</b><span>{m.body}</span></p>)}
        {busy && <p className="step"><b>aludel</b><span>…</span></p>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input ref={input} placeholder={hint || "Ask Aludel, or tell it what to set up…"} disabled={busy}
          onKeyDown={(e) => { if (e.key === "Tab" && hint && !e.currentTarget.value) { e.preventDefault(); e.currentTarget.value = hint; } }} />
      </form>
    </section>
  );
}
