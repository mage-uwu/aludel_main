import { newId } from "./id";
import { swap } from "./list";

// The atom. Each kind carries exactly the settings it can use — "a photo with a minimum value"
// or "a required button" cannot be written down, stored, or rendered, because no such type exists.
// A button block is a button placed in the flow; the buttons a task can *end* on are its outcomes.
export type BlockId = string & { readonly __blockId: unique symbol };
type Field = { id: BlockId; label: string; required: boolean };
export type Block =
  | (Field & { kind: "text"; placeholder: string })
  | (Field & { kind: "number"; min: number; max: number })
  | (Field & { kind: "photo" })
  | { id: BlockId; kind: "button"; label: string; action: "submit" | "reset" };

// One complete default per kind. Add a kind above and this record stops compiling until it
// has one — and the toolbar picks the new kind up for free.
const DEFAULTS: { [K in Block["kind"]]: (id: BlockId) => Extract<Block, { kind: K }> } = {
  text: (id) => ({ id, kind: "text", label: "Your question", required: false, placeholder: "" }),
  number: (id) => ({ id, kind: "number", label: "Amount", required: false, min: 0, max: 100 }),
  photo: (id) => ({ id, kind: "photo", label: "Upload a photo", required: false }),
  button: (id) => ({ id, kind: "button", label: "Submit", action: "submit" }),
};
export const KINDS = Object.keys(DEFAULTS) as readonly Block["kind"][];
export const createBlock = (kind: Block["kind"]): Block => DEFAULTS[kind](newId());

// The only four things that can happen to the blocks of a task: create, update, delete, reorder.
// Every action is tagged with the layer it acts on, so one dispatch serves the whole app.
export type BlockAction =
  | { on: "block"; type: "add"; kind: Block["kind"] }
  | { on: "block"; type: "save"; block: Block }
  | { on: "block"; type: "remove"; id: BlockId }
  | { on: "block"; type: "move"; id: BlockId; by: 1 | -1 };

export const reduceBlocks = (blocks: readonly Block[], action: BlockAction): readonly Block[] => {
  switch (action.type) {
    case "add": return [...blocks, createBlock(action.kind)];
    case "save": return blocks.map((b) => (b.id === action.block.id ? action.block : b));
    case "remove": return blocks.filter((b) => b.id !== action.id);
    case "move": {
      const i = blocks.findIndex((b) => b.id === action.id);
      return swap(blocks, i, i + action.by);
    }
  }
};

// Blocks are parsed, never merely inspected: each kind rebuilds itself out of the fields it
// knows about, so a stored block cannot arrive carrying a property its kind does not have.
type Raw = Record<string, unknown>;
const field = (b: Raw, id: BlockId, label: string): Field | null =>
  typeof b.required === "boolean" ? { id, label, required: b.required } : null;

const PARSE: { [K in Block["kind"]]: (b: Raw, id: BlockId, label: string) => Extract<Block, { kind: K }> | null } = {
  text: (b, id, label) => {
    const f = field(b, id, label);
    return f && typeof b.placeholder === "string" ? { ...f, kind: "text", placeholder: b.placeholder } : null;
  },
  number: (b, id, label) => {
    const f = field(b, id, label);
    return f && typeof b.min === "number" && typeof b.max === "number" && b.min <= b.max ? { ...f, kind: "number", min: b.min, max: b.max } : null;
  },
  photo: (b, id, label) => {
    const f = field(b, id, label);
    return f && { ...f, kind: "photo" };
  },
  button: (b, id, label) => (b.action === "submit" || b.action === "reset" ? { id, label, kind: "button", action: b.action } : null),
};

// A label is trimmed and, if that leaves nothing, replaced: a block the user cannot see is
// as good as no block at all.
const name = (v: unknown): string | null => (typeof v === "string" ? v.trim() || "Untitled" : null);

export const parseBlock = (v: unknown): Block | null => {
  const b = v as Raw;
  const label = name(b?.label);
  if (typeof b?.id !== "string" || label === null) return null;
  const kind = b.kind as Block["kind"];
  // hasOwn, not `in`: `in` walks the prototype chain, where "constructor" and "toString" live
  return Object.hasOwn(PARSE, kind) ? PARSE[kind](b, b.id as BlockId, label) : null;
};
