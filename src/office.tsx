import { useRef, useState, type ReactElement } from "react";
import { type Fact, type Payload } from "./kernel";
import { balance } from "./read";
import { seed } from "./demo";
import { store } from "./sync";

// Office mode: a conversation with the desk, and three lists. The chat is the authoring
// and dispatch surface — drafts arrive as cards and a tap commits them (via: "agent").
function Chat(): ReactElement {
  const [log, setLog] = useState<{ who: string; body: string }[]>([]);
  const [drafts, setDrafts] = useState<Payload[]>([]);
  const [busy, setBusy] = useState(false);
  const previous = useRef<string | undefined>(undefined); // the thread lives server-side, we hold its id
  const input = useRef<HTMLInputElement>(null);
  const send = async () => {
    const ask = input.current?.value.trim();
    if (!ask || busy) return;
    input.current!.value = "";
    setLog((l) => [...l, { who: "you", body: ask }]);
    setBusy(true);
    try {
      const res = await fetch("/api/agent", { method: "POST", body: JSON.stringify({ text: ask, previous: previous.current }) })
        .then((r) => (r.ok ? (r.json() as Promise<{ reply: string; drafts: Payload[]; previous?: string }>) : Promise.reject(new Error(String(r.status)))));
      previous.current = res.previous;
      setLog((l) => [...l, { who: "aludel", body: res.reply }]);
      setDrafts(res.drafts);
    } catch { setLog((l) => [...l, { who: "aludel", body: store.online ? "Aludel is unreachable right now." : "Aludel needs the server — this device is running standalone." }]); }
    setBusy(false);
  };
  const commit = () => {
    const refused = store.submit(drafts, "agent");
    setLog((l) => [...l, { who: "ledger", body: refused.length ? `refused: ${refused[0]!.reason}` : `${drafts.length} fact(s) appended.` }]);
    setDrafts([]);
  };
  return (
    <section className="chat">
      {log.map((m, i) => <p key={i} className={m.who}><b>{m.who}</b> {m.body}</p>)}
      {drafts.length > 0 && <div className="card">
        <b>Draft — nothing is real until you commit</b>
        <pre>{JSON.stringify(drafts, null, 1)}</pre>
        <button onClick={commit}>Commit</button><button className="ghost" onClick={() => setDrafts([])}>Discard</button>
      </div>}
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
