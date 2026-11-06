import type { OpColumn } from "src/drivers/EntityWriter.ts";
import type { ParsedFindQuery } from "src/queries/find/QueryParser.ts";
import { visitConditions } from "src/queries/find/QueryVisitor.ts";
import type { ColumnCondition } from "src/queries/parsedConditions.ts";

/**
 * Maps a filter whose values differ between batched calls to its binding positions and _find columns.
 *
 * I.e. calls with bindings ["Alice", 20, 30] and ["Alice", 40, 50] share the name filter,
 * but need _find columns for both bounds of their age BETWEEN filter.
 */
export interface FindArgumentMapping {
  /** Original filter from the first query; i.e. the column condition for `a.age BETWEEN 20 AND 30`. */
  condition: ColumnCondition;
  /** Positions in each call's bindings; i.e. [1, 2] reads the age bounds after the shared name. */
  bindingIndexes: number[];
  /** Corresponding _find columns; i.e. [{ columnName: "arg0", dbType: "int" }, { columnName: "arg1", dbType: "int" }] for the age bounds. */
  columns: OpColumn[];
}

/**
 * Returns conditions within `query` that are different across the batched find calls.
 *
 * Regular batching rewrites conditions like `a.name = ?` to `a.name = _find.arg0`.
 * The candidate phase preserves the original conditions; the exact-match phase uses the _find columns.
 *
 * We're only looking at 1 sample `query` in the batch, but `constantBindings` tells us which
 * offsets are constant across all queries in our batch; for these we skip b/c it's better to
 * keep the `a.name = ?` for better query planning.
 */
export function collectFindArguments(
  query: ParsedFindQuery,
  constantBindings: readonly boolean[],
  options: { arrayEquality?: boolean } = {},
): FindArgumentMapping[] {
  const mappings: FindArgumentMapping[] = [];
  let bindingIndex = 0;
  let columnIndex = 0;
  visitConditions(query, {
    visitCond(condition) {
      if (!("value" in condition.cond)) return;
      const start = bindingIndex;
      const count = condition.cond.kind === "between" ? 2 : 1;
      bindingIndex += count;

      // If every batched query shares this condition's value(s), leave it as a normal `col = ?`
      // condition (rendered from `entries[0]`'s value) instead of threading it through the CTE.
      let allConstant = true;
      for (let k = 0; k < count; k++) {
        if (!constantBindings[start + k]) {
          allConstant = false;
          break;
        }
      }
      if (allConstant) return;

      const bindingIndexes = Array.from({ length: count }, (_, index) => start + index);
      const kind = condition.cond.kind;
      // Figure out the _find CTE's `unnest($n::${dbType})` so Postgres knows what we're sending in.
      // Regular batching keeps eq scalar; candidate batching requests singleton arrays for eq.
      let dbType = condition.dbType;
      if (kind === "in" || kind === "nin" || (kind === "eq" && options.arrayEquality)) {
        dbType = `${condition.dbType}[]`;
      } else if (kind === "jsonPathExists" || kind === "jsonPathPredicate") {
        // jsonPath needs `::jsonpath` (not `::jsonb`, which would be an invalid `jsonb @@ jsonb`)
        dbType = "jsonpath";
      }

      // `arg${columnIndex}` keeps the CTE column names in step with the `_find.argX` references that
      // `rewriteToRawCondition` emits, since both only advance for the args we actually batch.
      const columns = bindingIndexes.map(() => ({ columnName: `arg${columnIndex++}`, dbType }));
      mappings.push({ condition, bindingIndexes, columns });
    },
  });
  return mappings;
}
