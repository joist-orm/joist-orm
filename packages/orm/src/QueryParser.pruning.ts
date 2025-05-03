import { ColumnCondition, ParsedExpressionFilter, ParsedFindQuery, RawCondition, parseAlias } from "./QueryParser";
import { assertNever } from "./utils";

// Remove any joins that are not used in the select or conditions
export function pruneUnusedJoins(parsed: ParsedFindQuery, keepAliases: string[]): void {
  const dt = new DependencyTracker();

  // First setup the alias -> alias dependencies...
  const todo = [...parsed.tables];
  while (todo.length > 0) {
    const t = todo.pop()!;
    if (t.join === "lateral") {
      dt.addAlias(t.alias, [t.fromAlias]);
      // Recurse into lateral joins...
      todo.push(...t.query.tables);
    } else if (t.join === "cte") {
      dt.addAlias(t.alias, [parseAlias(t.col1)]);
      todo.push(...t.query.tables);
    } else if (t.join === "cross") {
      // Doesn't have any conditions
    } else if (t.join !== "primary") {
      dt.addAlias(t.alias, [parseAlias(t.col1)]);
    }
  }

  // Mark all terminal usages
  parsed.selects.forEach((s) => {
    if (typeof s === "string") {
      if (!s.includes("count(")) dt.markRequired(parseAlias(s));
    } else {
      for (const a of s.aliases) dt.markRequired(a);
    }
  });
  parsed.orderBys.forEach((o) => dt.markRequired(o.alias));
  keepAliases.forEach((a) => dt.markRequired(a));
  // Look recursively into CTE & lateral join conditions
  const todo2 = [parsed];
  while (todo2.length > 0) {
    const query = todo2.pop()!;
    [...deepFindConditions(query.condition, true), ...deepFindConditions(query.having, true)].forEach((c) => {
      if (c.kind === "column") {
        dt.markRequired(c.alias);
      } else if (c.kind === "raw") {
        for (const alias of c.aliases) dt.markRequired(alias);
      } else {
        assertNever(c);
      }
    });
    todo2.push(...query.tables.filter((t) => t.join === "lateral" || t.join === "cte").map((t) => t.query));
  }

  // Now remove any unused joins
  // ...any CTE that's been flipped to `outer = false` has been voted as required, even if there isn't a condition
  parsed.tables = parsed.tables.filter((t) => dt.required.has(t.alias) || (t.join === "cte" && t.outer === false));

  // And then remove any inline soft-delete conditions we don't need anymore
  if (parsed.condition && parsed.condition.op === "and") {
    parsed.condition.conditions = parsed.condition.conditions.filter((c) => {
      if (c.kind === "column") {
        const prune = c.pruneable && !dt.required.has(c.alias);
        // if (prune) console.log(`DROPPING`, c);
        return !prune;
      } else {
        return c;
      }
    });
  }

  // Remove any `{ and: [...] }`s that are empty; we should probably do this deeply?
  if (parsed.condition && parsed.condition.conditions.length === 0) {
    parsed.condition = undefined;
  }
}

/** Pulls out a flat list of all `ColumnCondition`s from a `ParsedExpressionFilter` tree. */
export function deepFindConditions(
  condition: ParsedExpressionFilter | undefined,
  filterPruneable: boolean,
): (ColumnCondition | RawCondition)[] {
  const todo = condition ? [condition] : [];
  const result: (ColumnCondition | RawCondition)[] = [];
  while (todo.length !== 0) {
    const cc = todo.pop()!;
    for (const c of cc.conditions) {
      if (c.kind === "exp") {
        todo.push(c);
      } else if (c.kind === "column" || c.kind === "raw") {
        if (!filterPruneable || !c.pruneable) result.push(c);
      } else {
        assertNever(c);
      }
    }
  }
  return result;
}

/** Track join dependencies for `pruneUnusedJoins`. */
class DependencyTracker {
  private nodes: Map<string, string[]> = new Map();
  required: Set<string> = new Set();

  addAlias(alias: string, dependencies: string[] = []): void {
    this.nodes.set(alias, dependencies);
  }

  markRequired(alias: string): void {
    const marked = new Set<string>();
    const todo = [alias];
    while (todo.length > 0) {
      const alias = todo.pop()!;
      if (!marked.has(alias)) {
        marked.add(alias);
        todo.push(...(this.nodes.get(alias) || []));
      }
    }
    this.required = new Set([...this.required, ...marked]);
  }
}
