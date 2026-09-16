import { kqDot } from "../keywords.ts";
import type { ExistsCondition, ParsedFindQuery } from "../QueryParser.ts";
import { visitConditions, visitQueries } from "../QueryVisitor.ts";
import { fail } from "../utils.ts";

/**
 * Threads the find tag through each generated recursive filter after argument replacement.
 *
 * Before this call, collectAndReplaceArgs rewrites varying filter values to _find.argX,
 * including conditions inside non-recursive CTEs. I.e. for `mentorsRecursive: { firstName: ? }`,
 * if firstName's value is assigned arg4, the matching query uses `a1.first_name = _find.arg4`.
 * If lastName also varies, it gets its own argument, e.g. `a1.last_name = _find.arg5`.
 * Values shared by all finds stay inline. These arguments store filter values; we do not
 * add firstName or lastName to the matching query's returned columns.
 *
 * This function adds CROSS JOIN _find to that non-recursive matching query so it can read
 * the arguments. The matching query returns (id, tag); the recursive CTE returns
 * (match_id, owner_id, tag), regardless of how many fields the filter uses.
 * Both recursive terms preserve the tag, and EXISTS compares it with the enclosing find's tag.
 * I.e. tag 0 can find Alice's descendants while tag 1 finds Bob's descendants; an author
 * reachable in both traversals remains a separate (tag, match_id, owner_id) in the UNION.
 * Nested matching queries get their own _find binding, so inner CTEs never capture an
 * outer SQL row that is outside their scope.
 */
export function batchRecursiveCtes(query: ParsedFindQuery): void {
  let tagged = false;
  visitQueries(query, (current) => {
    tagged = tagRecursiveCtes(current) || tagged;
  });
  if (!tagged) return;
  visitConditions(query, {
    visitCond() {},
    visitExists(condition) {
      correlateRecursiveTag(condition);
    },
  });
}

/**
 * Binds _find in the non-recursive matching query and threads its tag through the recursive terms.
 * The recursive UNION deduplicates the resulting (match_id, owner_id, tag) rows.
 */
function tagRecursiveCtes(query: ParsedFindQuery): boolean {
  let tagged = false;
  for (const cte of query.ctes ?? []) {
    // This marker identifies the CTE pair generated for a recursive collection filter.
    // matchesAlias points to its non-recursive CTE, which also needs _find in its FROM.
    // An unrelated non-recursive CTE with varying arguments would need its own binding
    // and tag propagation; this helper only handles the generated pair's known columns.
    if (!cte.recursiveFilter || cte.query.kind !== "recursive") continue;
    tagged = true;
    const { matchesAlias } = cte.recursiveFilter;
    const matchesCte = query.ctes!.find((candidate) => candidate.alias === matchesAlias);
    if (matchesCte?.query.kind !== "ast") fail(`Missing matching query for recursive CTE ${cte.alias}`);
    const matches = matchesCte.query.query;
    matches.tables.push({ join: "cross", table: "_find", alias: "_find" });
    matches.selects.push(`${kqDot("_find", "tag")} AS tag`);
    // The recursive UNION removes duplicate matches. DISTINCT ON just the entity ID here
    // would incorrectly discard other tags when a related entity matches multiple finds.
    for (const table of matches.tables) {
      if (table.join === "outer") table.distinct = false;
    }
    const seedSource = cte.query.seed.tables.find((table) => table.table === matchesAlias)!;
    const stepSource = cte.query.step.tables.find((table) => table.table === cte.alias)!;
    cte.query.seed.selects.push(kqDot(seedSource.alias, "tag"));
    cte.query.step.selects.push(kqDot(stepSource.alias, "tag"));
    cte.columns!.push({ columnName: "tag", dbType: "int" });
  }
  return tagged;
}

/** Restricts recursive membership to the enclosing find's tag, including inside NOT EXISTS. */
function correlateRecursiveTag(condition: ExistsCondition): void {
  if (!condition.recursiveCte) return;
  const reach = condition.subquery.tables.find((table) => table.table === condition.recursiveCte)!;
  const correlation = {
    kind: "raw" as const,
    aliases: [reach.alias, "_find"],
    condition: `${kqDot(reach.alias, "tag")} = ${kqDot("_find", "tag")}`,
    bindings: [],
    pruneable: false,
  };
  condition.subquery.condition = {
    kind: "exp",
    op: "and",
    conditions: [...(condition.subquery.condition ? [condition.subquery.condition] : []), correlation],
  };
  condition.outerAliases.push("_find");
}
