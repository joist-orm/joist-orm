import { kqDot } from "../keywords.ts";
import type { ExistsCondition, ParsedFindQuery } from "../QueryParser.ts";
import { visitConditions, visitQueries } from "../QueryVisitor.ts";
import { fail } from "../utils.ts";

/**
 * Carries the find tag through each generated recursive filter after argument replacement.
 *
 * Matching related entities read their arguments from a local _find row. Both recursive terms
 * preserve that row's tag, and membership correlates it with the enclosing find's tag.
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
 * Adds a local _find binding to matching related entities and carries its tag through reachability.
 * The recursive UNION deduplicates the resulting (match_id, owner_id, tag) rows.
 */
function tagRecursiveCtes(query: ParsedFindQuery): boolean {
  let tagged = false;
  for (const cte of query.ctes ?? []) {
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
