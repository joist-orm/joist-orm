
  const query = buildQuery(knex, Bill, { ...queryFilter, keepAliases: keepBli ? ["bli"] : [], pruneJoins });

  // Add this manually b/c they need SUMs which em.find can't do yet
  if (orderByKey === "balanceInCents" || orderByKey === "billedInCents") {
    // Clear the default order by id, remove the distinct and do a group by for the SUM
    void query.clearOrder().clearSelect().select("b.*").groupBy("b.id");
    if (orderByKey === "billedInCents") {
      void query.orderByRaw(`SUM(bli.amount_in_cents) ${orderByDirection}`);
    } else if (orderByKey === "balanceInCents") {
      void query.orderByRaw(`SUM(bli.amount_in_cents) - b.quickbooks_amount_paid_in_cents ${orderByDirection}`);
    }
  }

  // We return the custom query with the correct order
  // And also the query filter, to get the pageInfo in billsPageQuery
  return { query, filter: queryFilter satisfies FilterAndSettings<Bill>, marketSubtypeCount };

// === em.query version ===
//
// This is entity mode (returns Bill[]) with ORDER BY on aggregate expressions.
// GROUP BY b.id ensures one row per entity, SUM is only used for ordering.
//
// This maps well to em.query. Entity mode + groupBy + aggregate orderBy is a
// valid combo — PG allows SELECT b.* with GROUP BY b.id since PK functionally
// determines all columns.
//
// GAP: `rawExpr` in orderBy for the balance formula. The `sum()` helper handles
// the simple case, but `SUM(bli.amount_in_cents) - b.quickbooks_amount_paid_in_cents`
// is a compound expression. We need `rawExpr<number>(sql)` in orderBy.

const [b, bli] = aliases(Bill, BillLineItem);

// Build the orderBy based on the key
const orderByClause =
  orderByKey === "billedInCents"
    ? [orderByDirection === "ASC" ? asc(sum(bli.amountInCents)) : desc(sum(bli.amountInCents))]
    : orderByKey === "balanceInCents"
      ? [
          orderByDirection === "ASC"
            ? asc(rawExpr<number>("SUM(bli.amount_in_cents) - b.quickbooks_amount_paid_in_cents"))
            : desc(rawExpr<number>("SUM(bli.amount_in_cents) - b.quickbooks_amount_paid_in_cents")),
        ]
      : undefined; // default ordering

const needsAggregate = orderByKey === "balanceInCents" || orderByKey === "billedInCents";

const bills = await em.query({
  select: b,
  from: b,
  // Only join bli when we need the aggregate
  join: needsAggregate ? [b.on(bli.bill)] : [],
  where: {
    and: [
      // ... spread in the same conditions from queryFilter
    ],
  },
  // GROUP BY b.id when using aggregates — PG allows SELECT b.* since id is PK
  ...(needsAggregate ? { groupBy: [b.id] } : {}),
  ...(orderByClause ? { orderBy: orderByClause } : {}),
});
// → Bill[]
