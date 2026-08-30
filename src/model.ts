// The whole domain. A template is an ordered list of blocks, and each kind carries exactly the
// settings it can use — "a photo with a minimum value" or "a required button" cannot be written
// down, stored, or rendered, because no such type exists.
export type BlockId = string & { readonly __blockId: unique symbol };
type Field = { id: BlockId; label: string; required: boolean };
export type Block =
  | (Field & { kind: "text"; placeholder: string })
  | (Field & { kind: "number"; min: number; max: number })
  | (Field & { kind: "photo" })
  | { id: BlockId; kind: "button"; label: string; action: "submit" | "reset" };

// Create: one complete default per kind. Add a kind above and this record stops compiling
// until it has one — and the toolbar below picks the new kind up for free.
const DEFAULTS: { [K in Block["kind"]]: (id: BlockId) => Extract<Block, { kind: K }> } = {
  text: (id) => ({ id, kind: "text", label: "Your question", required: false, placeholder: "" }),
  number: (id) => ({ id, kind: "number", label: "Amount", required: false, min: 0, max: 100 }),
  photo: (id) => ({ id, kind: "photo", label: "Upload a photo", required: false }),
  button: (id) => ({ id, kind: "button", label: "Submit", action: "submit" }),
};
export const KINDS = Object.keys(DEFAULTS) as readonly Block["kind"][];
export const create = (kind: Block["kind"]): Block => DEFAULTS[kind](crypto.randomUUID() as BlockId);

// The only four things that can happen to a template: create, update, delete, reorder.
export type Action =
  | { type: "add"; kind: Block["kind"] }
  | { type: "save"; block: Block }
  | { type: "remove"; id: BlockId }
  | { type: "move"; id: BlockId; by: 1 | -1 };

export const reduce = (blocks: readonly Block[], action: Action): readonly Block[] => {
  switch (action.type) {
    case "add": return [...blocks, create(action.kind)];
    case "save": return blocks.map((b) => (b.id === action.block.id ? action.block : b));
    case "remove": return blocks.filter((b) => b.id !== action.id);
    case "move": {
      const i = blocks.findIndex((b) => b.id === action.id);
      const [from, to] = [blocks[i], blocks[i + action.by]];
      if (!from || !to) return blocks; // unknown id, or a move off either end: no-op
      const next = [...blocks];
      [next[i], next[i + action.by]] = [to, from];
      return next;
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
const isBlock = (v: unknown): v is Block => {
  const b = v as Record<string, unknown>;
  const kind = b?.kind as Block["kind"];
  return typeof b?.id === "string" && typeof b.label === "string" && kind in VALID && VALID[kind](b);
};

// Read and write are total: storage that is missing, blocked, or corrupt costs nothing.
const KEY = "forms-builder/v1";
export const load = (): readonly Block[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter(isBlock) : [];
  } catch { return []; }
};
export const persist = (blocks: readonly Block[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(blocks)); } catch { /* not remembered, still usable */ }
};
