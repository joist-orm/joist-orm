import { OpColumn } from "./drivers/EntityWriter";
import { ParsedCteClause } from "./QueryParser";

/**
 * Creates a CTE named `alias` that bulk-injects the `columnValues` into a SQL query.
 *
 * I.e. `columns = [first_name, last_name]` means columnValues would be all first names,
 * then all last names, i.e.`[["f1","f2"], ["l1","l2"]]`.
 *
 * Note that `columnValues` will be mutated if any array columns need to be made rectangular.
 */
export function buildUnnestCte(alias: string, columns: OpColumn[], columnValues: any[][]): ParsedCteClause {
  // Make any arrays-of-arrays rectangular by filling them with nulls
  ensureRectangularArraySizes(columns, columnValues);
  // Use unnest or unnest_arrays depending on whether the column is an array column
  const selects = columns.map((c) => {
    if (c.dbType.endsWith("[]")) {
      if (c.isNullableArray) {
        return `unnest_arrays(?::${c.dbType}[], true)`;
      } else {
        return `unnest_arrays(?::${c.dbType}[])`;
      }
    } else {
      return `unnest(?::${c.dbType}[])`;
    }
  });
  return {
    alias,
    columns,
    query: { kind: "raw", sql: `SELECT ${selects.join(", ")}`, bindings: columnValues },
  };
}

export function ensureRectangularArraySizes(columns: OpColumn[], columnValues: any[][]): void {
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    if (column.dbType.endsWith("[]")) {
      const values = columnValues[i];
      const fillTo = findArrayMaxSize(values);
      for (let j = 0; j < values.length; j++) {
        values[j] = fillArrayWithNulls(column, values[j], fillTo);
      }
    }
  }
}

function findArrayMaxSize(columnValues: readonly any[][]): number {
  let max = 1; // postgres really doesn't like `{{}}` so always send at least 1 element
  for (let i = 0; i < columnValues.length; i++) max = Math.max(max, columnValues[i]?.length ?? 0);
  return max;
}

// Because postgres array-of-arrays must be rectangular, we fill all arrays up the same max size
// to put on the wire, and then later strip the padded nulls during the unnest_arrays call.
function fillArrayWithNulls(c: OpColumn, array: any[] | null, maxSize: number): any[] {
  const wasNull = array === null;
  const result = array ? [...array] : [];
  const nullsToAdd = Math.max(0, maxSize - (array?.length ?? 0));
  for (let i = 0; i < nullsToAdd; i++) result.push(null);
  // Add our unset marker
  if (c.isNullableArray) result.unshift(wasNull ? null : 1);
  return result;
}
