
        // ignore test projects as those should not receive finance transactions
        const baseQuery = buildQuery(knex, Project, { where: { isTest: false } });
        // ts_search is not good at matching street suffix abbreviations (eg, boulevard => blvd).  Usually this is the
        // at the end of a street name, so we pop words off the end until we're at a minimum of 2 words hoping for a
        // match if we haven't gotten one yet.
        while (words.length > 1) {
          const query = baseQuery.clone();
          await addPgSearchToQuery(query, "ts_search", words.join(" "));
          const projects = await em.loadFromQuery(Project, query);
          if (projects.nonEmpty) {
            // prefer active > complete > warranty > hold > closed, and Structure > Lot
            return projects.sortBy((p) => [statusToOrderMap[p.status], projectTypeToOrderMap(p)]).first!;
          }
          words.pop();
        }

// === em.query version ===
//
// GAP: ts_search is a tsvector column that may not be a modeled Joist field. We need a
// standalone `rawCondition(sql, bindings, aliases)` function (not tied to an alias field)
// for conditions on unmodeled columns / raw SQL expressions.
//
// If ts_search IS a modeled field, we could use `p.tsSearch.raw(...)` instead.

const [p] = aliases(Project);
while (words.length > 1) {
  const projects = await em.query({
    select: p,
    from: p,
    where: {
      and: [
        p.isTest.eq(false),
        rawCondition(`p."ts_search" @@ plainto_tsquery(?)`, [words.join(" ")], [p]),
      ],
    },
  });
  // → Project[]
  if (projects.nonEmpty) {
    return projects.sortBy((pr) => [statusToOrderMap[pr.status], projectTypeToOrderMap(pr)]).first!;
  }
  words.pop();
}


