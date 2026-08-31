import { useSyncExternalStore, useState, type ReactElement } from "react";
import Field from "./field";
import Office from "./office";
import { store } from "./sync";

export default function App(): ReactElement {
  useSyncExternalStore(store.subscribe, () => store.version);
  const canOffice = store.me.role !== "field";
  const [mode, setMode] = useState<"office" | "field">(() => (canOffice && localStorage.getItem("mode") !== "field" ? "office" : "field"));
  if (store.me.role === null && !store.me.email) // Access let us through but the worker could not verify us
    return <main className="gate"><h1>Aludel</h1><p>Couldn't verify your session — refresh, or check the Access setup.</p></main>;
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
