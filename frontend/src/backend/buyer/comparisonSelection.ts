// Comparison picks belong to one server run. Subscription updates can replace
// that run without any local navigation or refresh click.
export type ComparisonSelection = { runId: string | null; ids: string[] };

export function comparisonIds(
  selection: ComparisonSelection,
  runId: string | null,
): string[] {
  return selection.runId === runId ? selection.ids : [];
}

export function updateComparison(
  selection: ComparisonSelection,
  runId: string | null,
  update: string[] | ((ids: string[]) => string[]),
): ComparisonSelection {
  const current = comparisonIds(selection, runId);
  return { runId, ids: typeof update === "function" ? update(current) : update };
}
