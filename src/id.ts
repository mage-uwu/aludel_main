// crypto.randomUUID exists only in a secure context, so over plain http it is simply missing —
// and an app that cannot mint an id cannot even start. This fallback is not cryptographic; it
// only has to avoid collisions inside one document, and load() drops duplicates regardless.
export const newId = <Id extends string>(): Id =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`) as Id;
