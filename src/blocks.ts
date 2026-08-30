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
export const createBlock = (kind: Block["kind"]): Block => DEFAULTS[kind](crypto.randomUUID() as BlockId);

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

// Anything not provably a block is dropped, so damaged storage can never reach the UI.
const VALID: { [K in Block["kind"]]: (b: Record<string, unknown>) => boolean } = {
  text: (b) => typeof b.required === "boolean" && typeof b.placeholder === "string",
  number: (b) => typeof b.required === "boolean" && typeof b.min === "number" && typeof b.max === "number" && b.min <= b.max,
  photo: (b) => typeof b.required === "boolean",
  button: (b) => b.action === "submit" || b.action === "reset",
};
export const isBlock = (v: unknown): v is Block => {
  const b = v as Record<string, unknown>;
  const kind = b?.kind as Block["kind"];
  return typeof b?.id === "string" && typeof b.label === "string" && kind in VALID && VALID[kind](b);
};
