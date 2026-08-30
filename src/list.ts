// Swap two items by index. Either index outside the list is a no-op — this is the single place
// the app's "move up / move down" gets its safety at the ends, for blocks, tasks and outcomes.
export const swap = <T>(list: readonly T[], i: number, j: number): readonly T[] => {
  const [a, b] = [list[i], list[j]];
  if (a === undefined || b === undefined) return list;
  const next = [...list];
  [next[i], next[j]] = [b, a];
  return next;
};

// Keep only the first item carrying each id. Duplicates are not merely untidy: two blocks
// sharing an id means one edit changes both of them, and one delete removes both.
export const unique = <T extends { id: string }>(list: readonly T[]): readonly T[] =>
  list.filter((item, i) => list.findIndex((other) => other.id === item.id) === i);

// For .filter() over parse results, which come back as `T | null`.
export const present = <T>(v: T | null): v is T => v !== null;
