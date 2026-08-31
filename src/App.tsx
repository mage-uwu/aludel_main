import { useSyncExternalStore, useState, type ReactElement } from "react";
import Field from "./field";
import Office from "./office";
import { store } from "./sync";

export default function App(): ReactElement {
  useSyncExternalStore(store.subscribe, () => store.version);
  const canOffice = store.me.role !== "field";
  const [mode, setMode] = useState<"office" | "field">(() =>
    canOffice && localStorage.getItem("mode") !== "field" ? "office" : "field");
  if (store.me.role === null && !store.me.email) // a server is present and we're signed out
    return <main className="gate"><h1>Aludel</h1><p>The ledger of the work.</p><a className="button" href="/api/auth/login">Sign in with Google</a></main>;
  if (store.online && store.me.role === null) return (
    <main className="gate"><h1>Aludel</h1><p>You're signed in, but not on a team yet.</p>
      <button onClick={() => void fetch("/api/team", { method: "POST" }).then(() => store.boot())}>Found a team</button></main>
  );
  return (
    <main>
      <header className="top">
        <h1>Aludel</h1>
        {canOffice && <nav>{(["office", "field"] as const).map((m) => <button key={m} className={m === mode ? "on" : ""} onClick={() => { setMode(m); localStorage.setItem("mode", m); }}>{m}</button>)}</nav>}
        <span className="hint">{store.online ? store.me.email : "standalone"}{store.queue.length > 0 && ` · ${store.queue.length} queued`}</span>
      </header>
      {mode === "office" && canOffice ? <Office /> : <Field />}
    </main>
  );
}
