import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { store } from "./sync";
import "./index.css";

void store.boot().then(() => {
  store.tick(); // standalone mode has no cron; the store runs the same pure plan()
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
});
if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
