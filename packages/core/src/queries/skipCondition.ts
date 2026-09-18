import type { ColumnCondition } from "./parsedConditions.ts";

/** An undefined predicate is pruned by either query parser. */
export const skipCondition: ColumnCondition = {
  kind: "column",
  alias: "skip",
  column: "skip",
  dbType: "skip",
  cond: undefined as any,
};
