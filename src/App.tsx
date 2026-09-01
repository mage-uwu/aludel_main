import { useSyncExternalStore, useState, type ReactElement } from "react";
import Field from "./field";
import Office from "./office";
import { store } from "./sync";

export default function App(): ReactElement {
  useSyncExternalStore(store.subscribe, () => store.version);
  const canOffice = store.me.role !== "field"; const [menu, setMenu] = useState(false); const q = store.queue.length;
  const [mode, setMode] = useState<"office" | "field">(() => (canOffice && localStorage.getItem("mode") !== "field" ? "office" : "field"));
  if (store.me.role === null && !store.me.email) return <main className="gate"><h1>Aludel</h1><p>Couldn't verify your session — refresh, or check the Access setup.</p></main>; // Access let us through but the worker could not verify us
  return (
    <main className={mode}>
      <header className="top"><h1>Aludel</h1>
        <button className="kit" title="Menu" onClick={() => setMenu(!menu)}>[ ]</button>
        {menu && <div className="kit-menu">
          {canOffice && <nav>{(["office", "field"] as const).map((m) => <button key={m} className={m === mode ? "on" : ""} onClick={() => { setMode(m); setMenu(false); localStorage.mode = m; }}>{m}</button>)}</nav>}
          <nav>{["auto","light","dark"].map((k) => <button key={k} data-skin={k} onClick={() => (localStorage.skin = document.documentElement.dataset.theme = k)}>{k}</button>)}</nav>
          <span className="hint">{store.online ? store.me.email : "standalone"}{!!q && ` · ${q} queued`}</span></div>}
      </header>
      {mode === "office" && canOffice ? <Office /> : <Field />}
    </main>
  );
}
