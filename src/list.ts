// Swap two items by index. Either index outside the list is a no-op — this is the single place
// the app's "move up / move down" gets its safety at the ends, for blocks, tasks and outcomes.
export const swap = <T>(list: readonly T[], i: number, j: number): readonly T[] => {
  const [a, b] = [list[i], list[j]];
  if (a === undefined || b === undefined) return list;
  const next = [...list];
  [next[i], next[j]] = [b, a];
  return next;
};
