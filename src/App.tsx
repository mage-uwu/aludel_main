import { useEffect, useReducer, type ReactElement, type ReactNode } from "react";
import { KINDS, type Block } from "./blocks";
import { load, persist, reduce, tasks } from "./tasks";
type Save = (block: Block) => void;
const toNumber = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
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
          <Setting name="Min"><input type="number" value={block.min} onChange={(e) => save({ ...block, min: Math.min(toNumber(e.target.value), block.max) })} /></Setting>
          <Setting name="Max"><input type="number" value={block.max} onChange={(e) => save({ ...block, max: Math.max(toNumber(e.target.value), block.min) })} /></Setting>
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
  useEffect(() => persist(doc), [doc]);
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
        <input className="title" value={open.title} onChange={(e) => dispatch({ on: "task", type: "rename", title: e.target.value })} />
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
              <input className="name" value={block.label} onChange={(e) => save({ ...block, label: e.target.value })} />
              <button title="Move up" disabled={i === 0} onClick={() => dispatch({ on: "block", type: "move", id: block.id, by: -1 })}>↑</button>
              <button title="Move down" disabled={i === open.blocks.length - 1} onClick={() => dispatch({ on: "block", type: "move", id: block.id, by: 1 })}>↓</button>
              <button title="Delete" onClick={() => dispatch({ on: "block", type: "remove", id: block.id })}>✕</button>
            </header>
            <Body block={block} save={save} />
          </li>
        ))}
      </ol>
    </main>
  );
}
