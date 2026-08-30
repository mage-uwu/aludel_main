import { useEffect, useReducer, useRef, useState, type ReactElement, type ReactNode } from "react";
import { KINDS, type Block } from "./blocks";
import { reduce, tasks } from "./tasks";
import { load, onExternalChange, persist } from "./storage";
type Save = (block: Block) => void;
// A label may be blank while it is being typed, never once the field is left.
const Label = ({ value, fallback, save, className }: { value: string; fallback: string; save: (v: string) => void; className?: string }) => (
  <input className={className} value={value} onChange={(e) => save(e.target.value)} onBlur={(e) => save(e.target.value.trim() || fallback)} />
);

// A number being typed is not yet a number: "", "-" and "2." are all valid keystrokes on the
// way to one, and a field that sanitises every keystroke can never be typed a negative into.
// So it holds the raw text and commits only when it is left, or on Enter.
function NumberField({ value, commit }: { value: number; commit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const done = () => {
    const n = Number(draft);
    if (draft?.trim() && Number.isFinite(n)) commit(n);
    setDraft(null);
  };
  return <input type="text" inputMode="decimal" value={draft ?? String(value)} onChange={(e) => setDraft(e.target.value)}
                onBlur={done} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />;
}

const Setting = ({ name, children }: { name: string; children: ReactNode }) => <label className="setting">{name} {children}</label>;
const Required = ({ on, save }: { on: boolean; save: (on: boolean) => void }) => <Setting name="Required"><input type="checkbox" checked={on} onChange={(e) => save(e.target.checked)} /></Setting>;

// One branch per kind: what the responder will see, then the settings that kind actually has.
function Body({ block, save }: { block: Block; save: Save }): ReactElement {
  switch (block.kind) {
    case "text":
      return (<>
        <input className="field" disabled placeholder={block.placeholder || "Short answer"} />
        <div className="settings">
          <Setting name="Placeholder"><input value={block.placeholder} onChange={(e) => save({ ...block, placeholder: e.target.value })} /></Setting>
          <Required on={block.required} save={(required) => save({ ...block, required })} />
        </div>
      </>);
    case "number":
      return (<>
        <input className="field" type="number" disabled placeholder={`${block.min} to ${block.max}`} />
        <div className="settings">
          <Setting name="Min"><NumberField value={block.min} commit={(n) => save({ ...block, min: Math.min(n, block.max) })} /></Setting>
          <Setting name="Max"><NumberField value={block.max} commit={(n) => save({ ...block, max: Math.max(n, block.min) })} /></Setting>
          <Required on={block.required} save={(required) => save({ ...block, required })} />
        </div>
      </>);
    case "photo":
      return (<>
        <input className="field" type="file" accept="image/*" disabled />
        <div className="settings"><Required on={block.required} save={(required) => save({ ...block, required })} /></div>
      </>);
    case "button":
      return (<>
        <button className="field cta" disabled>{block.label}</button>
        <div className="settings"><Setting name="Action">
          <select value={block.action} onChange={(e) => save({ ...block, action: e.target.value === "reset" ? "reset" : "submit" })}>
            <option value="submit">submit</option><option value="reset">reset</option>
          </select>
        </Setting></div>
      </>);
  }
}

export default function App() {
  const [doc, dispatch] = useReducer(reduce, undefined, load);
  const fromOtherTab = useRef(false);
  useEffect(() => {
    if (fromOtherTab.current) fromOtherTab.current = false; // a document that arrived from another tab is not news to send back
    else persist(doc);
  }, [doc]);
  useEffect(() => onExternalChange((incoming) => {
    fromOtherTab.current = true;
    dispatch({ on: "doc", type: "adopt", tasks: incoming });
  }), []);
  const save: Save = (block) => dispatch({ on: "block", type: "save", block });
  const { open } = doc;
  return (
    <main>
      <h1>Forms builder</h1>
      <nav className="tabs">
        {tasks(doc).map((task) => (
          <button key={task.id} className={task.id === open.id ? "tab current" : "tab"} onClick={() => dispatch({ on: "task", type: "open", id: task.id })}>{task.title || "Untitled"}</button>
        ))}
        <button className="tab" onClick={() => dispatch({ on: "task", type: "add" })}>+ task</button>
      </nav>
      <header className="task">
        <Label className="title" value={open.title} fallback="Untitled task" save={(title) => dispatch({ on: "task", type: "rename", title })} />
        <button title="Move task earlier" disabled={doc.before.length === 0} onClick={() => dispatch({ on: "task", type: "move", by: -1 })}>↑</button>
        <button title="Move task later" disabled={doc.after.length === 0} onClick={() => dispatch({ on: "task", type: "move", by: 1 })}>↓</button>
        <button title="Delete task" onClick={() => (open.blocks.length === 0 || confirm(`Delete "${open.title}" and its ${open.blocks.length} block(s)?`)) && dispatch({ on: "task", type: "remove", id: open.id })}>✕</button>
      </header>
      <nav className="kinds">{KINDS.map((kind) => <button key={kind} onClick={() => dispatch({ on: "block", type: "add", kind })}>+ {kind}</button>)}</nav>
      {open.blocks.length === 0 && <p className="empty">Add a block to start this task. It saves as you type.</p>}
      <ol>
        {open.blocks.map((block, i) => (
          <li key={block.id}>
            <header>
              <span className="badge">{block.kind}</span>
              <Label className="name" value={block.label} fallback="Untitled" save={(label) => save({ ...block, label })} />
              <button title="Move up" disabled={i === 0} onClick={() => dispatch({ on: "block", type: "move", id: block.id, by: -1 })}>↑</button>
              <button title="Move down" disabled={i === open.blocks.length - 1} onClick={() => dispatch({ on: "block", type: "move", id: block.id, by: 1 })}>↓</button>
              <button title="Delete" onClick={() => dispatch({ on: "block", type: "remove", id: block.id })}>✕</button>
            </header>
            <Body block={block} save={save} />
          </li>
        ))}
      </ol>
      <section className="outcomes">
        <h2>Ends with</h2>
        {open.outcomes.map((outcome, i) => (
          <span className="outcome" key={outcome.id}>
            <button title="Move earlier" disabled={i === 0} onClick={() => dispatch({ on: "outcome", type: "move", id: outcome.id, by: -1 })}>←</button>
            <Label value={outcome.label} fallback="Outcome" save={(label) => dispatch({ on: "outcome", type: "rename", id: outcome.id, label })} />
            <button title="Move later" disabled={i === open.outcomes.length - 1} onClick={() => dispatch({ on: "outcome", type: "move", id: outcome.id, by: 1 })}>→</button>
            <button title="Delete outcome" disabled={open.outcomes.length === 1} onClick={() => dispatch({ on: "outcome", type: "remove", id: outcome.id })}>✕</button>
          </span>
        ))}
        <button onClick={() => dispatch({ on: "outcome", type: "add" })}>+ outcome</button>
      </section>
    </main>
  );
}
