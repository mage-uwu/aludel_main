import { useState, type ReactElement } from "react";
import { taskOf, type Block, type EntryId, type Rec, type Value } from "./kernel";
import { find, type Hit } from "./read";
import { putBlob, store } from "./sync";

// Field mode: the list of what's outstanding, and the logger. The field only ever writes
// one fact — logged — and the outcomes are the buttons it ends on.
const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function BlockRow({ b, value, set }: { b: Block; value: Value | undefined; set: (v: Value | undefined) => void }): ReactElement | null {
  switch (b.kind) {
    case "text": return <label>{b.label}{b.required && " *"}<input value={(value as string) ?? ""} placeholder={b.placeholder} onChange={(e) => set(e.target.value || undefined)} /></label>;
    case "number": return <label>{b.label}{b.required && " *"}<input type="text" inputMode="decimal" value={(value as number)?.toString() ?? ""} placeholder={`${b.min}–${b.max}`}
      onChange={(e) => { const n = Number(e.target.value); set(e.target.value.trim() && Number.isFinite(n) ? Math.min(Math.max(n, b.min), b.max) : undefined); }} /></label>;
    case "photo": return <label>{b.label}{b.required && " *"}<input type="file" accept="image/*" capture="environment" onChange={(e) => void (async () => {
      const f = e.target.files?.[0]; if (!f) return;
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await f.arrayBuffer()))].map((x) => x.toString(16).padStart(2, "0")).join("");
      await putBlob(hash, f); void fetch(`/api/blob/${hash}`, { method: "PUT", body: f }).catch(() => undefined); // bytes follow when the network allows
      set(hash);
    })()} />{value ? "✓ attached" : null}</label>;
    case "button": return b.action === "reset" ? <button className="ghost" onClick={() => set(undefined)}>{b.label}</button> : null;
  }
}

function Logger({ hit, done }: { hit: Rec; done: () => void }): ReactElement {
  const [values, setValues] = useState<Record<string, Value>>({});
  const [task, form] = [taskOf(store.state, hit)!, store.state.forms[hit.form]!];
  const missing = task.blocks.filter((b) => b.kind !== "button" && b.required && values[b.key] === undefined);
  const log = (outcome: string) => {
    const refused = store.submit([{ type: "logged", entry: hit.id, values, outcome }]);
    if (refused.length) alert(refused[0]!.reason); else done();
  };
  return (
    <section className="sheet">
      <header><button className="ghost" onClick={done}>← back</button><h2>{task.title}</h2><p>{form.meta.name} · {form.meta.address} · due {fmt(hit.window.due)}</p></header>
      {task.blocks.map((b) => <BlockRow key={b.key} b={b} value={values[b.key]}
        set={(v) => setValues(({ [b.key]: _, ...rest }) => (v === undefined ? rest : { ...rest, [b.key]: v }))} />)}
      <footer>
        <p className="hint">{missing.length ? `still needed: ${missing.map((b) => b.label).join(", ")}` : "ends with"}</p>
        {task.outcomes.map((o) => <button key={o.key} className="outcome" disabled={missing.length > 0} onClick={() => log(o.key)}>{o.label}</button>)}
      </footer>
    </section>
  );
}

export default function Field(): ReactElement {
  const [openId, setOpen] = useState<EntryId | null>(null);
  const [list, setList] = useState<string | null>(null);
  const now = Date.now();
  const mine = (h: Hit) => (!h.assignee || h.assignee === store.me.email) && (!list || (h.list ?? "unrouted") === list);
  const overdue = find(store.state, { status: "overdue" }, now).filter(mine);
  const pending = find(store.state, { status: "pending" }, now).filter(mine);
  const today = find(store.state, { status: "logged", from: now - 86_400_000 }, now).filter(mine);
  const lists = [...new Set(find(store.state, {}, now).map((h) => h.list ?? "unrouted"))].sort();
  const open = openId && store.state.entries[openId];
  if (open) return <Logger hit={open} done={() => setOpen(null)} />;

  const row = (h: Hit, cls = "") => {
    const task = taskOf(store.state, h);
    return <button key={h.id} className={`entry ${cls}`} onClick={() => setOpen(h.id)}>
      <b>{task?.title ?? h.task}</b><span>{store.state.forms[h.form]?.meta.name} · due {fmt(h.window.due)}</span></button>;
  };
  return (
    <section>
      {lists.length > 1 && <nav className="tabs chips">{[null, ...lists].map((l) => <button key={l ?? "all"} className={l === list ? "on" : ""} onClick={() => setList(l)}>{l ?? "all lists"}</button>)}</nav>}
      {overdue.length > 0 && <><h2 className="bad">Past due · {overdue.length}</h2>{overdue.map((h) => row(h, "bad"))}</>}
      <h2>Open · {pending.length}</h2>
      {pending.length ? pending.map((h) => row(h)) : <p className="hint">Nothing pending. The schedule will bring more.</p>}
      {today.length > 0 && <><h2>Logged in the last day · {today.length}</h2>{today.map((h) => <div key={h.id} className="entry done"><b>{taskOf(store.state, h)?.title}</b><span>{h.logged && new Date(h.logged.at).toLocaleTimeString()} · {h.logged?.actor}</span></div>)}</>}
    </section>
  );
}
