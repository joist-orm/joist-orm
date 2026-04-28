import {
  ColumnCondition,
  ExistsCondition,
  ParsedExpressionFilter,
  ParsedFindQuery,
  RawCondition,
  parseAlias,
} from "./QueryParser";
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
    } else if (t.join === "cross") {
      dt.markRequired(t.alias);
    } else if (t.join === "primary") {
      dt.markRequired(t.alias);
    } else if (parsed.ctes?.some((cte) => cte.alias === t.table)) {
      dt.markRequired(t.alias);
    } else {
      dt.addAlias(
        t.alias,
        [parseAlias(t.col1), parseAlias(t.col2)].filter((alias) => alias !== t.alias),
      );
    }
  }

  // Mark all terminal usages
  parsed.selects.forEach((s) => {
    if (typeof s === "string") {
      markSelectAliases(dt, parsed, s);
    } else if ("aliases" in s) {
      for (const a of s.aliases) dt.markRequired(a);
    }
  });
  parsed.orderBys.forEach((o) => dt.markRequired(o.alias));
  keepAliases.forEach((a) => dt.markRequired(a));
  // Look recursively into CTE & lateral join conditions
  const todo2 = [{ query: parsed, filterPruneable: true }];
  while (todo2.length > 0) {
    const { query, filterPruneable } = todo2.pop()!;
    deepFindConditions(query.condition, filterPruneable).forEach((c) => {
      if (c.kind === "column") {
        dt.markRequired(c.alias);
      } else if (c.kind === "raw") {
        for (const alias of c.aliases) dt.markRequired(alias);
      } else if (c.kind === "exists") {
        for (const alias of c.outerAliases) dt.markRequired(alias);
      } else {
        assertNever(c);
      }
    });
    todo2.push(
      ...query.tables.filter((t) => t.join === "lateral").map((t) => ({ query: t.query, filterPruneable: false })),
    );
  }

  // Now remove any unused joins
  parsed.tables = parsed.tables.filter((t) => dt.required.has(t.alias));

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

/** Marks aliases used by select strings, including generated CTI expressions like `COALESCE(st0.col, st1.col)`. */
function markSelectAliases(dt: DependencyTracker, parsed: ParsedFindQuery, select: string): void {
  for (const table of parsed.tables) {
    if (selectReferencesAlias(select, table.alias)) {
      dt.markRequired(table.alias);
    }
  }
}

/** Returns true if a raw select expression references `alias.column`. */
export function selectReferencesAlias(select: string, alias: string): boolean {
  // Most selects are simple `a.*`, but CTI adds expressions like
  // `COALESCE(p_s0.shared_column, p_s1.shared_column) as shared_column`.
  // Those expressions must keep the subtype joins, but `parseAlias` only sees
  // the leading function name. Instead of parsing SQL, scan for the only alias
  // forms Joist generates in selects: `alias.column` and `"alias".column`.
  return selectReferencesCandidate(select, `${alias}.`) || selectReferencesCandidate(select, `"${alias}".`);
}

/** Returns true when `candidate` is present at a SQL identifier boundary. */
function selectReferencesCandidate(select: string, candidate: string): boolean {
  let index = select.indexOf(candidate);
  while (index !== -1) {
    // Avoid treating `foo.a.id` as a reference to `a`; Joist-generated aliases
    // appear at the start of an expression or after punctuation/whitespace.
    const previous = select[index - 1];
    if (index === 0 || (previous !== "." && !isSqlIdentifierChar(previous))) return true;
    index = select.indexOf(candidate, index + candidate.length);
  }
  return false;
}

/** Returns true for characters that can be part of an unquoted SQL identifier. */
function isSqlIdentifierChar(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

/** Pulls out a flat list of all `ColumnCondition`s from a `ParsedExpressionFilter` tree. */
export function deepFindConditions(
  condition: ParsedExpressionFilter | undefined,
  filterPruneable: boolean,
): (ColumnCondition | RawCondition | ExistsCondition)[] {
  const todo = condition ? [condition] : [];
  const result: (ColumnCondition | RawCondition | ExistsCondition)[] = [];
  while (todo.length !== 0) {
    const cc = todo.pop()!;
    for (const c of cc.conditions) {
      if (c.kind === "exp") {
        todo.push(c);
      } else if (c.kind === "column" || c.kind === "raw") {
        if (!filterPruneable || !c.pruneable) result.push(c);
      } else if (c.kind === "exists") {
        result.push(c);
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
