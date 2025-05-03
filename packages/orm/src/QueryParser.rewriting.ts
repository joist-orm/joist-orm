import { groupBy } from "joist-utils";
import { AliasAssigner } from "./AliasAssigner";
import { buildCondition } from "./drivers/buildUtils";
import {
  ColumnCondition,
  CteJoinTable,
  handleCount,
  ParsedExpressionCondition,
  ParsedExpressionFilter,
  ParsedValueFilter,
  RawCondition,
} from "./QueryParser";
import { visitFilter } from "./QueryVisitor";

export function rewriteTopLevelCondition(aliases: AliasAssigner, condition: ParsedExpressionFilter): void {
  type Todo = { condition: ParsedExpressionFilter; isTopLevelAnd: boolean };
  const todo: Todo[] = [{ condition, isTopLevelAnd: condition.kind === "exp" && condition.op === "and" }];
  while (todo.length > 0) {
    const { condition, isTopLevelAnd } = todo.pop()!;

    // Only top-level ands can completely push down their conditions
    if (isTopLevelAnd && condition.kind === "exp" && condition.op === "and") {
      const { conditions: cc } = condition;
      for (let i = cc.length - 1; i >= 0; i--) {
        const c = cc[i];

        // Collect all the aliases used in this condition (which might be just one, if it's a simple column condition)
        const used = findUsedAliases(c);
        // How many child CTEs does it touch, if any?
        const touchedCtes: Array<CteJoinTable | "root"> = used
          .map((a) => aliases.getCtes(a)[0])
          .map((c) => c ?? "root");

        if (touchedCtes.length === 0) {
          // Nothing to do, leave this condition in-place
        } else if (touchedCtes.length === 1 && touchedCtes[0] === "root") {
          // Nothing to do, leave this condition in-place
        } else if (touchedCtes.length === 1) {
          // If it only touches one, we can push it down directly to that CTE
          const [cte] = touchedCtes;
          if (c.kind === "column" && c.column === "$count") {
            const maybeIsNull = handleCount(cte as any, c.cond as ParsedValueFilter<number>);
            if (maybeIsNull) {
              cc[i] = maybeIsNull;
            } else {
              cc.splice(i, 1);
            }
          } else {
            // cte.query.condition!.conditions.push(c);
            cc.splice(i, 1);
            // ...need to ensure this CTE, and it's parent CTEs, have "at least one" enabled
            // cte.outer = false;
          }
        } else {
          // Find the common parent CTE, if any
          const ctePaths = used.map((a) => aliases.getCtePath(a));
          const target = deepestCommonCte(ctePaths);
          if (!target) {
            // This condition is using multiple CTEs, so we have to leave it here leave it here and rewrite
            // (should be similar to our OR handling?)
            // ...probably just push it onto the queue
            // todo.push({ condition: c, isTopLevelAnd: false });
          } else {
            // Push it into the target (which may not be a 1st-level CTE), but [0] currently gets back to that...
            const cte = aliases.getCtes(target)[0];
            // Rewrite it within its target...
            cte.query.condition!.conditions.push(c);
            cc.splice(i, 1);
            rewriteIfNeeded(cte, aliases, cte.query.condition!.conditions, i);
            cte.outer = false;
          }
        }
      }
      return;
    }

    // We're not a top-level AND, so we can't push down, we can only group & rewrite/replace
    const cc = condition.conditions.map((c) => {
      const used = findUsedAliases(c);
      const touchedCtes = used.map((a) => aliases.getCtes(a)[0]).filter((c) => !!c);
      return { condition: c, used, touchedCtes };
    });

    // group by top-level CTE(s), like `[]` or `[a]` or `[a,b]`
    const grouped = groupBy(cc, (c) => {
      return c.touchedCtes.map((c) => c.alias).join(",");
    });

    // Transform the conditions, which might be condensing ones that go into the same CTE
    condition.conditions = Object.values(grouped).flatMap((group) => {
      // This group will all have the same touchedCtes, which might be [] or [a] or [a,b]
      const touchedCtes = group[0].touchedCtes;
      if (touchedCtes.length === 0) {
        // Nothing to do, leave these conditions as-is
        return group.map((g) => g.condition);
      } else if (touchedCtes.length === 1) {
        // We can push it down directly to that CTE, but need to keep the condition here
        throw new Error("todo0");
      } else {
        throw new Error("todo");
      }
    });
  }
}

/** ...we've decided that `conditions[i]` must "stay put", but get its components rewritten into o2ms? */
function rewriteIfNeeded(
  targetCte: CteJoinTable | undefined,
  aliases: AliasAssigner,
  conditions: ParsedExpressionCondition[],
  i: number,
): void {
  let j = 0;
  type Todo = { conditions: ParsedExpressionCondition[]; i: number };
  const todo: Todo[] = [{ conditions, i }];
  while (todo.length) {
    const { conditions, i } = todo.pop()!;
    const c = conditions[i];
    if (c.kind === "exp" && c.op === "or") {
      // Dumb recursion...
      for (let j = 0; j < c.conditions.length; j++) {
        todo.push({ conditions: c.conditions, i: j });
      }
    } else if (c.kind === "column") {
      // Which CTE if any does this column belong to?
      const ctes = aliases.getCtes(c.alias);
      const leafCte = ctes[ctes.length - 1];
      if (leafCte === targetCte) {
        // we're fine
      } else if (leafCte) {
        const as = `_${c.alias}_${c.column}_${j++}`;
        // Replace this condition with a reference
        conditions[i] = {
          kind: "raw",
          aliases: [leafCte.alias],
          condition: `${leafCte.alias}.${as}`,
          bindings: [],
          pruneable: false,
        } satisfies RawCondition;
        // add to select...
        const [sql, bindings] = buildCondition(c);
        leafCte.query.selects.push({ sql: `BOOL_OR(${sql}) as ${as}`, aliases: [c.alias], bindings });
      } else {
        throw new Error("todo2");
      }
    } else {
      throw new Error("todo2");
    }
  }
  const c = conditions[i];

  // Do any of the conditions within it nested inside of CTEs?

  //   const as = `_${alias}_${cond.column}_${j++}`;
  //   conditions[i] = {
  //     kind: "raw",
  //     aliases: [topLevelLateralJoin],
  //     condition: `${topLevelLateralJoin}.${as}`,
  //     bindings: [],
  //     pruneable: false,
  //     ...{ rewritten: true },
  //   } satisfies RawCondition;
}

// Collect all the aliases used in this condition
function findUsedAliases(c: ParsedExpressionCondition): string[] {
  const used: Set<string> = new Set();
  visitFilter(c, {
    visitCond(c: ColumnCondition) {
      used.add(c.alias);
    },
    visitRaw(c: RawCondition) {
      for (const a of c.aliases) used.add(a);
    },
  });
  return [...used];
}

function deepestCommonCte(ctePaths: string[][]): string | undefined {
  // First turn them all into `books`, `books/reviews/ratings`, etc.
  const paths = ctePaths.map((path) => path.join("/"));
  // Then find the longest common prefix
  const prefix = longestCommonPrefix(paths);
  if (!prefix) return undefined;
  const aliases = prefix.split("/");
  return aliases[aliases.length - 1];
}

function longestCommonPrefix(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  // Function to find the common prefix between two strings
  const commonPrefix = (str1: string, str2: string): string => {
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) i++;
    return str1.substring(0, i);
  };
  // Initialize the prefix with the first string
  let prefix = paths[0];
  // Iterate through the paths to find the common prefix
  for (let i = 1; i < paths.length; i++) {
    prefix = commonPrefix(prefix, paths[i]);
    if (prefix === "") return undefined;
  }
  return prefix;
}
