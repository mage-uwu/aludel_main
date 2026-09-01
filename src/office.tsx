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
type Norm = {
  op?: string; target?: string; to?: string; by?: number;                 // a correction, in the shared verbs
  title?: string; labels?: string[]; days?: number;                       // an answer to a cue
  every?: number | null; unit?: Cadence["unit"]; blocks?: { kind: string; label: string }[];
} | null;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
const outcome = (label: string): Outcome => ({ key: slug(label), label: label.replace(/_+/g, " ").trim(), cost: /no.?access|skip/i.test(label) ? 0 : 1 }); // "part of a plan" is just outcome costs
const newTask = (title: string): Task => ({ key: slug(title), title, outcomes: [], blocks: [] });
const move = (a: Block[], i: number, by: number) => { const j = i + by; if (a[j]) [a[i], a[j]] = [a[j]!, a[i]!]; };
const block = (kind: string, label: string): Block => {
  const key = slug(label); label = label.replace(/_+/g, " ").trim() || label;
  return kind === "number" ? { key, kind, label, required: false, min: 0, max: 999999 }
    : kind === "photo" ? { key, kind, label, required: false } : { key, kind: "text", label, required: false, placeholder: "" };
};

// The verbs, shared by every cue: add · rename · remove · move (+ task). Any cue can take one
// of these instead of an answer, so a correction is never mistaken for the reply to a question.
// The job under construction: the first one still missing an essential, else the newest. So
// "next: filter cleaning" cannot strand the job before it — the checklist walks back, asks for
// what it lacks, and only then moves on. Nothing incomplete can be left behind for the guard.
const K = (t: Template): Task =>
  t.tasks.find((x) => !x.title || !x.outcomes.length) ?? t.tasks[t.tasks.length - 1] ?? { key: "", title: "", outcomes: [], blocks: [] };
const at = (t: Template) => Math.max(0, t.tasks.indexOf(K(t))); // cues are keyed to the job they ask about
const op = (t: Template, a: string, n: Norm) => {
  const k = K(t), m = a.match(/^(photo|number|text)\s+(.+)/i); // an explicit kind is an instruction, not a hint
  const v = m ? "add" : /^(?:no,? )?(?:delete|remove|drop|scratch)\b/i.test(a) ? "remove" : n?.op ?? "add";
  if (v === "task") return void t.tasks.push(newTask(n?.title || a));
  const q = (n?.target ?? a.replace(/^\W*\w+\s+/, "")).toLowerCase().trim(); // "delete ph" means pH, never Photos
  const i = [(l: string) => l === q, (l: string) => l.split(/\W+/).includes(q), (l: string) => l.includes(q)].reduce((r, f) => (r >= 0 ? r : k.blocks.findIndex((x) => f(x.label.toLowerCase()))), -1);
  if (v === "remove") { if (i >= 0) k.blocks.splice(i, 1); return; } if (v === "move") { if (i >= 0) move(k.blocks, i, n?.by ?? -1); return; }
  if (v === "rename") { if (i >= 0) k.blocks[i]!.label = n?.to ?? a; else { k.title = n?.to ?? a; k.key = slug(k.title); } return; } // nothing named: they meant the task
  for (const b of m ? [{ kind: m[1]!.toLowerCase(), label: m[2]!.trim() }] : n?.blocks ?? [{ kind: "text", label: a }]) k.blocks.push(block(b.kind, b.label));
};

// A routine is a branched checklist. Every cue states when it is still unanswered (`need`),
// and only asks then — so a branch is nothing but a need that stays false down the road not
// taken: decline the repeat and the three cues behind it never fire. The next question is
// always just the first unanswered cue, which is why a correction can arrive at any moment,
// re-route the draft, and leave the cue standing there to ask itself again.
type Cue = { key: string; need: (t: Template) => boolean; q: (t: Template) => string; hint?: string; kind: string; take: (t: Template, a: string, n: Norm) => void };

// The TASK subroutine — one pass per job on the report, and it repeats for every job named.
// Nothing here asks about the site: the client, the address and the phone belong to the site,
// never to its paperwork, so the crew is never invited to type them into a form.
const TASK: Cue[] = [
  { key: "title", kind: "task", need: (t) => !t.tasks.length || !K(t).title,
    q: (t) => (t.tasks.length > 1 ? "What is the next job called?" : "What is the first job you do on site?"),
    take: (t, a, n) => { const x = n?.title || a; if (!t.tasks.length) t.tasks.push(newTask(x)); else { K(t).title = x; K(t).key = slug(x); } } },
  { key: "every", kind: "cadence", need: (t) => !K(t).cadence, hint: "every 3 weeks",
    q: (t) => `Does "${K(t).title}" repeat? Say how often — or 'no'.`,
    take: (t, a, n) => { const m = a.match(/(\d+)\s*(day|week|month)/i);
      if (m) K(t).cadence = { every: +m[1]!, unit: m[2]!.toLowerCase() as Cadence["unit"], withinDays: 0 };
      else if (n?.every) K(t).cadence = { every: n.every, unit: n.unit ?? "week", withinDays: 0 }; } },
  { key: "due", kind: "days", need: (t) => !!K(t).cadence && !K(t).cadence?.withinDays, hint: "3 days",
    q: (t) => `Once "${K(t).title}" comes up, how many days does the crew have to do it?`,
    take: (t, a, n) => { const d = n?.days ?? +(a.match(/\d+/)?.[0] ?? 0); const c = K(t).cadence; if (c && d > 0) c.withinDays = d; } },
  { key: "record", kind: "blocks", need: (t) => !K(t).blocks.length, hint: "a photo",
    q: (t) => `While doing "${K(t).title}", what does the crew write down or photograph? Or 'none'.`, take: op },
  { key: "ends", kind: "outcomes", need: (t) => !K(t).outcomes.length, hint: "Done, Follow-up, No access",
    q: (t) => `How can "${K(t).title}" end?`,
    take: (t, a, n) => { K(t).outcomes = (n?.labels ?? a.split(",").map((x) => x.trim())).map(outcome).filter((o) => o.label); } },
];

// The TEMPLATE routine wraps it: name the report, walk a job, then keep offering another.
const ROUTINE: Cue[] = [
  { key: "name", kind: "title", need: (t) => !t.name, q: () => "What should the report be called?",
    take: (t, a, n) => { t.name = n?.title || a; } },
  ...TASK,
  { key: "more", kind: "blocks", need: () => true, hint: "done",
    q: (t) => `Anything else for "${K(t).title}"? Fix a field, or name another job — or 'done'.`, take: op },
];
const pending = (t: Template, shut: string[]) => ROUTINE.find((c) => !shut.includes(`${c.key}@${at(t)}`) && c.need(t)); // per job: a new one reopens them

const zz = (ms: number) => new Promise((ok) => setTimeout(ok, ms)); type Act = { sel: string; text?: string; go: (d: Template, s?: string) => void }; // text set = the caret types it in
// The hand's script: what changed between two drafts, as the edits a person would make. Each
// action names the control it uses — the + field button, a block's ✕, a pencil — so the cursor
// can go press it. Reorders and rarities fall through to the final snap; nothing is ever lost.
const acts = (a: Template, b: Template): Act[] => {
  const out: Act[] = []; const J = JSON.stringify;
  if (a.name !== b.name) out.push({ sel: ".pencil.name", text: b.name, go: (d, s) => { d.name = s ?? b.name; } });
  b.tasks.forEach((t, i) => {
    const p = a.tasks[i] ?? { ...t, cadence: undefined, outcomes: [], blocks: [] }; const S = `.task:nth-of-type(${i + 1})`; const n = Math.min(p.blocks.length, t.blocks.length);
    if (!a.tasks[i]) { out.push({ sel: ".tpl", go: (d) => { d.tasks[i] = { ...t, title: "", cadence: undefined, outcomes: [], blocks: [] }; } });
      out.push({ sel: `${S} > .pencil`, text: t.title, go: (d, x) => { d.tasks[i]!.title = x ?? t.title; } }); }
    else if (p.title !== t.title) out.push({ sel: `${S} > .pencil`, text: t.title, go: (d, s) => { d.tasks[i]!.title = s ?? t.title; } });
    if (J(p.cadence) !== J(t.cadence)) out.push({ sel: S, go: (d) => { d.tasks[i]!.cadence = t.cadence; } });
    if (J(p.outcomes) !== J(t.outcomes)) out.push({ sel: `${S} .ends`, go: (d) => { d.tasks[i]!.outcomes = t.outcomes; } });
    const perm = p.blocks.length === t.blocks.length && p.blocks.every((b) => t.blocks.some((x) => x.key === b.key)) && t.blocks.some((b, j) => p.blocks[j]?.key !== b.key);
    if (perm) out.push({ sel: `${S} div:nth-of-type(${t.blocks.findIndex((b, j) => p.blocks[j]?.key !== b.key) + 1}) [title="Move up"]`, go: (d) => { d.tasks[i]!.blocks = structuredClone(t.blocks); } });
    t.blocks.slice(0, perm ? 0 : n).forEach((k, j) => J(p.blocks[j]) !== J(k) && out.push({ sel: `${S} div:nth-of-type(${j + 1}) .pencil`, text: k.label,
      go: (d, s) => { d.tasks[i]!.blocks[j] = s === undefined ? k : { ...k, label: s }; } }));
    for (let j = p.blocks.length - 1; j >= n; j--) out.push({ sel: `${S} div:nth-of-type(${j + 1}) [title="Remove"]`, go: (d) => { d.tasks[i]!.blocks.splice(j, 1); } });
    t.blocks.slice(n).forEach((k, j) => { const at = n + j; // press + field, then name it
      out.push({ sel: `${S} .add`, go: (d) => { d.tasks[i]!.blocks.push({ ...k, label: "" }); } });
      out.push({ sel: `${S} div:nth-of-type(${at + 1}) .pencil`, text: k.label, go: (d, s) => { const x = d.tasks[i]!.blocks[at]; if (x) x.label = s ?? k.label; } }); });
  }); return out; };

// The form on the stage. Read-only in the Templates tab; with `edit`, every label is a pencil
// and every field can be moved or dropped — the same surface Aludel writes into.
const Form = ({ t, edit }: { t: Template; edit?: (f: (d: Template) => void) => void }): ReactElement => (
  <article className="tpl">
    {edit ? <input className="pencil name" value={t.name} placeholder="Report name" onChange={(e) => edit((d) => { d.name = e.target.value; })} /> : <h3>{t.name} <span className="v">v{t.version}</span></h3>}
    {t.tasks.map((k, ti) => <div className="task" key={ti}>
      {edit ? <input className="pencil" value={k.title} onChange={(e) => edit((d) => { d.tasks[ti]!.title = e.target.value; })} /> : <b>{k.title}</b>}
      {k.cadence && <em>every {k.cadence.every} {k.cadence.unit}{k.cadence.withinDays > 1 && ` · ${k.cadence.withinDays} days to do it`}</em>}
      {k.blocks.map((b, bi) => <div className="wrap" key={bi}>
        <Input b={b} label={edit ? <input className="pencil" value={b.label} onChange={(e) => edit((d) => { d.tasks[ti]!.blocks[bi]!.label = e.target.value; })} /> : undefined} />
        {edit && <span className="tools"><button title="Move up" disabled={bi === 0} onClick={() => edit((d) => move(d.tasks[ti]!.blocks, bi, -1))}>↑</button>
          <button title="Move down" disabled={bi === k.blocks.length - 1} onClick={() => edit((d) => move(d.tasks[ti]!.blocks, bi, 1))}>↓</button><button title="Remove" onClick={() => edit((d) => { d.tasks[ti]!.blocks.splice(bi, 1); })}>✕</button></span>}
      </div>)}
      {edit && <button className="add" onClick={() => edit((d) => { d.tasks[ti]!.blocks.push(block("text", "New field")); })}>+ field</button>}
      <footer className="ends"><span className="hint">ends with</span>
        {k.outcomes.map((o, oi) => edit
          ? <input key={oi} className="outcome pencil" value={o.label}
              onChange={(e) => edit((d) => { const x = d.tasks[ti]!.outcomes[oi]!; x.label = e.target.value; x.key = slug(x.label); })} />
          : <span key={oi} className="outcome">{o.label.replace(/_+/g, " ")}</span>)}
      </footer>
    </div>)}
  </article>
);

const line = (f: Fact): string =>
  f.type === "granted" ? `${f.email} granted ${f.role}` : f.type === "declared" ? `site declared: ${f.site.client.name}` : f.type === "signed" ? (f.template.retired ? `retired "${f.template.name}" — no new work will be planned from it` : `template signed: ${f.template.name} v${f.template.version}`) : f.type === "bound" ? "service bound to site" :
  f.type === "dispatched" ? `dispatched ${f.entries.length} task(s) → ${f.form.meta.name}` : f.type === "logged" ? `logged — ${f.outcome}` : f.type === "corrected" ? `corrected (${f.reason})` : f.type === "steered" ? `due date moved (${f.reason})` : (f as { type: string }).type;

export default function Office(): ReactElement {
  const [log, setLog] = useState([{ who: "step", body: "Aludel ready. Ask for a new report, or ask about the work." }]); const [tab, setTab] = useState("templates");
  const [draft, setDraft] = useState<Template | null>(null); const [drafts, setDrafts] = useState<Payload[]>([]);
  const [shut, setShut] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(""); // shut: cues the human closed ("done", "no"); null = not in the routine
  const [wide, setWide] = useState(() => localStorage.getItem("split") ?? "stage"); // which pane gets φ's long side
  const win = (w: string) => { setWide(w); localStorage.setItem("split", w); };
  const previous = useRef<string | undefined>(undefined); // the agent thread lives server-side; the interview lives here
  const input = useRef<HTMLInputElement>(null); const tail = useRef<HTMLDivElement>(null); const stage = useRef<HTMLDivElement>(null); const hand = useRef<HTMLDivElement>(null); const caret = useRef<HTMLDivElement>(null);
  useEffect(() => { tail.current?.scrollTo({ top: 1e7 }); if (shut && !busy) stage.current?.scrollTo({ top: 1e7, behavior: "smooth" }); }, [log, busy, draft, shut]); // the stage follows what Aludel just wrote
  const edit = (f: (d: Template) => void) => setDraft((d) => { if (!d) return d; const c = structuredClone(d); f(c); return c; });
  // The hand plays each edit where its control lives — glide, tap, land — busy the whole while so
  // nobody edits under it. The final snap makes the outcome exact even if a selector misses.
  const perform = async (list: Act[], final: Template) => {
    setBusy(true); const h = hand.current, bar = caret.current;
    if (!h || !bar || matchMedia("(prefers-reduced-motion: reduce)").matches) { setDraft(final); setBusy(false); return; }
    const box = () => stage.current!.parentElement!.getBoundingClientRect();
    const put = (e: HTMLElement, x: number, y: number) => { const s = box();
      Object.assign(e.style, { opacity: "1", left: `${Math.min(x - s.left, s.width - 24)}px`, top: `${y - s.top}px` }); };
    // Motion a person reads as intent, not a tween: a far target takes longer than a near one,
    // the path bows instead of ruling a diagonal, and it eases out of one control into the next.
    const glide = (x: number, y: number) => new Promise<void>((ok) => { const s = box();
      const x0 = parseFloat(h.style.left) || 0, y0 = parseFloat(h.style.top) || 0;
      const dx = Math.min(x - s.left, s.width - 24) - x0, dy = y - s.top - y0, d = Math.hypot(dx, dy) || 1;
      const ms = Math.min(820, 190 + d * 0.72), bow = Math.min(64, d * 0.22) * (dx > 0 ? 1 : -1), t0 = performance.now();
      h.style.opacity = "1";
      const tick = (t: number) => { const p = Math.min(1, (t - t0) / ms); // ease in, ease out, bowed sideways
        const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2, k = Math.sin(e * Math.PI) * bow;
        h.style.left = `${x0 + dx * e - (dy / d) * k}px`; h.style.top = `${y0 + dy * e + (dx / d) * k}px`;
        p < 1 ? requestAnimationFrame(tick) : ok(); };
      requestAnimationFrame(tick); });
    const off = () => { const s = box(); return [s.left + s.width * 0.72, s.bottom + 44] as const; }; // below the stage, out of sight
    if (list.length && !+h.style.opacity) put(h, ...off()); // it enters from off-stage once, then stays
    for (const a of list) {
      const scope = a.sel.split(" ")[0]!; // a missed selector falls back to the job it belongs to, never the whole card
      const el = (stage.current?.querySelector(a.sel) ?? stage.current?.querySelector(scope)) as HTMLElement | null;
      if (el) {
        const s0 = box(), r0 = el.getBoundingClientRect();
        if (r0.top < s0.top + 10 || r0.bottom > s0.bottom - 10) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); await zz(260); }
        const r = el.getBoundingClientRect(); // a small control is clicked in the middle, a wide row near its text
        await glide(r.width < 170 ? r.left + r.width / 2 : r.left + Math.min(r.width * 0.3, 140), r.top + r.height / 2);
        await zz(120); h.classList.add("tap"); await zz(150); h.classList.remove("tap"); }
      if (a.text !== undefined && el) { // the caret takes over where the pointer just clicked
        const f = getComputedStyle(el), pad = parseFloat(f.paddingLeft) + parseFloat(f.borderLeftWidth);
        const ctx = document.createElement("canvas").getContext("2d")!; ctx.font = f.font;
        const r = el.getBoundingClientRect(), pace = a.text.length > 22 ? 22 : 38;
        await glide(r.right - 22, r.top + r.height / 2); // it moves aside, clear of the letters it is typing
        for (let j = 1; j <= a.text.length; j++) {
          setDraft((d) => { const c = structuredClone(d ?? final); a.go(c, a.text!.slice(0, j)); return c; });
          put(bar, r.left + pad + ctx.measureText(a.text.slice(0, j)).width, r.top + r.height / 2); await zz(pace); }
        await zz(220); bar.style.opacity = "0";
      } else setDraft((d) => { const c = structuredClone(d ?? final); a.go(c); return c; });
      await zz(240); }
    setDraft(final); setBusy(false); };  // it rests where it finished; the routine ending is what sends it home
  const say = (t: Template, sh: string[]) => { const c = pending(t, sh); setHint(c?.hint ?? ""); if (!c) { setShut(null); park(); } // scripted lines speak mint
    setLog((l) => [...l, { who: "step", body: c ? c.q(t) : `"${t.name}" is on the stage — tweak anything, then commit it.` }]); };
  const wizard = (id?: string, named?: string) => { const v = id ? store.state.latest[id as TemplateId] : undefined; // an id means: add a task to that template, as its next version
    const t: Template = v ? { ...structuredClone(store.state.templates[`${id}@${v}`]!), version: v + 1 } : { id: newId<TemplateId>(), version: 1, name: named ?? "", tasks: [] };
    if (v) t.tasks.push(named ? newTask(named) : { key: "", title: "", outcomes: [], blocks: [] }); // named already? then the cue it would have asked is answered before it fires
    setDraft(t); setShut([]); say(t, []); };
  const dead = drafts.flatMap((d) => (d.type === "signed" && d.template.retired ? [d.template.name] : []))[0]; // a staged retirement escalates: the prompt, not the button
  const send = async (text?: string) => { const ask = (text ?? input.current?.value ?? "").trim() || (shut ? hint : "");
    if (!ask || busy) return;
    input.current!.value = ""; setLog((l) => [...l, { who: "you", body: ask }]);
    if (dead) return void (/^y(es)?$/i.test(ask) ? commit() : setLog((l) => [...l, { who: "err", body: `Type YES to retire "${dead}", or press Discard. Logged work is kept either way.` }]));
    if (shut && draft) { // the routine: answer the cue, or throw an edit at it — the model only normalizes
      const c = pending(draft, shut)!; const skip = /^(?:done|no|nope|none|skip|that.s it)\b\.?$/i.test(ask); setBusy(true);
      const n: Norm = skip || !store.online ? null : await fetch("/api/refine", { method: "POST", body: JSON.stringify({ kind: c.kind, text: ask }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const t = structuredClone(draft); const sh = skip || n?.op === "skip" ? [...shut, `${c.key}@${at(draft)}`] : shut; // shut the cue for the job it was asked about
      if (sh === shut) (n?.op && n.op !== "answer" ? op : c.take)(t, ask, n); // an op is a correction, not an answer to the cue
      await perform(acts(draft, t), t); setShut(sh); say(t, sh); return; }
    setBusy(true);
    try { const res = await fetch("/api/agent", { method: "POST", body: JSON.stringify({ text: ask, previous: previous.current, view: { tab, draft, drafts } }) }).then((r) => (r.ok ? (r.json() as Promise<{ reply: string; drafts: Payload[]; previous?: string; wizard?: boolean | string; named?: string }>) : Promise.reject(new Error(String(r.status)))));
      previous.current = res.previous; setLog((l) => [...l, { who: "aludel", body: res.reply }]);
      const d0 = res.drafts[0]; const sg = res.drafts.length === 1 && d0?.type === "signed" && !d0.template.retired ? d0.template : null;
      if (sg) { const from = draft?.id === sg.id ? draft : store.state.latest[sg.id] ? structuredClone(store.state.templates[`${sg.id}@${store.state.latest[sg.id]}`]!) : { ...sg, name: "", tasks: [] }; // an edit plays as the diff from the stage draft if one is open, else the live version; a new report builds from nothing
        setDraft({ ...structuredClone(from), id: sg.id, version: sg.version }); await perform(acts(from, sg), sg); } else setDrafts(res.drafts);
      if (res.wizard) wizard(typeof res.wizard === "string" ? res.wizard : undefined, res.named);
    } catch { setLog((l) => [...l, { who: "err", body: store.online ? "Aludel is unreachable right now." : "Aludel needs the server — this device is standalone." }]); }
    setBusy(false); };
  const park = () => { if (hand.current) hand.current.style.opacity = "0"; }; // the work is over: the hand leaves
  const clear = () => { setDraft(null); setDrafts([]); setShut(null); setHint(""); park(); };
  const commit = () => { const no = store.submit(draft ? [{ type: "signed", template: draft }] : drafts, "agent"); setLog((l) => [...l, { who: no.length ? "err" : "ledger", body: no.length ? `refused: ${no[0]!.reason}` : "appended to the ledger." }]); if (!no.length) clear(); };
  const s = store.state, now = Date.now(), live = draft || drafts.length > 0;
  return (
    <section className={`term wide-${wide}`}>
      <section className="stage">
        <nav className="tabs">{live // while a draft is live the bar names it; the commit lives at the prompt, not on the phone
          ? <b>{shut ? "Aludel is building…" : "Draft · uncommitted"}</b>
          : ["templates", "sites", "ledger"].map((t) => <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
          <button className="win" title={wide === "min" ? "Restore" : "Minimize"} onClick={() => win(wide === "min" ? "stage" : "min")}>{wide === "min" ? "▣" : "—"}</button>
          <button className="win" title={wide === "max" ? "Restore" : "Maximize"} onClick={() => win(wide === "max" ? "stage" : "max")}>▢</button></nav>
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
        <div className="hand" ref={hand}><i /></div>
        <div className="caret" ref={caret} />
      </section>
      <button className="grip" title={wide === "term" ? "Give the form more room" : "Give the conversation more room"} onClick={() => win(wide === "term" ? "stage" : "term")} />
      <div className="log" ref={tail}>
        {log.map((m, i) => <p key={i} className={m.who}><b>{m.who}</b><span>{m.body}</span></p>)}
        {busy && <p className="step"><b>aludel</b><span>…</span></p>}</div>
      {live && <div className="deck"><button className="go" onClick={commit} disabled={busy || !!dead}>Commit</button>
        <button className="ghost" onClick={clear} disabled={busy}>Discard</button></div>}
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input ref={input} placeholder={hint || "Ask Aludel, or tell it what to set up…"} disabled={busy}
          onKeyDown={(e) => { if (e.key === "Tab" && hint && !e.currentTarget.value) { e.preventDefault(); e.currentTarget.value = hint; } }} /></form>
    </section>
  );
}
