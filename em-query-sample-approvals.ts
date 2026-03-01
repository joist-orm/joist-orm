
    const [user, iu, tpu, h] = aliases(User, InternalUser, TradePartnerUser, Homeowner);
    let requestedByCondition: ExpressionFilter | undefined;
    if (requestedBy) {
      const idsByTag = requestedBy.groupBy((id) => tagFromId(id));
      requestedByCondition = { or: { user, iu, tpu, h }.toEntries().map(([tag, alias]) => alias.id.in(idsByTag[tag])) };
    }

    const query = buildQuery(knex, Approval, {
      where: {
        approvers,
        requestedAt: toDatetimeValueFilter(requestedAt),
        dueOn: toDateValueFilter(dueOn),
        createdAt: toDatetimeValueFilter(createdAt),
        status: calculatedApprovalStatus,
        requestedBy: { as: user, tradePartnerUsers: tpu, internalUser: iu, homeowner: h },
        ...otherNonDateFilters,
      },
      conditions: requestedByCondition,
      limit: 300,
      orderBy: { dueOn: "ASC" },
    });

    if (subjectType) {
      const { components } = getMetadata(Approval).fields["subject"] as PolymorphicField;
      void query.where((query) =>
        subjectType
          .map((type) =>
            getApprovalSubjectConstructors()
              .map((subject) => getMetadata(subject))
              .find((meta) => meta.type === pascalCase(type)),
          )
          .map((meta) => components.find((c) => c.otherMetadata() === meta)!)
          .forEach(({ columnName }) => query.orWhereNotNull(columnName)),
      );
    }

    return { pageInfo: new StaticPageInfo(false, 0), approvals: await em.loadFromQuery(Approval, query) };

// === em.query version ===
//
// Most of this already works — the original is basically em.find with one extra
// dynamic polymorphic filter tacked on. The poly filter dynamically checks
// `subject_x_id IS NOT NULL` for matching component columns.
//
// GAP: Polymorphic "subject type" filtering. The poly alias's `.ne(null)` checks
// ALL components. We need per-component NOT NULL checks. Two approaches:
//   a) Access individual poly component fields directly (e.g. `appr.subjectBill.ne(null)`)
//      — each component is already a separate m2o field on Approval.
//   b) Use raw conditions on the specific column names.
//
// Option (a) is clean if the caller can map type strings → field names.

const [appr] = aliases(Approval);
const [user2, iu2, tpu2, h2] = aliases(User, InternalUser, TradePartnerUser, Homeowner);

let requestedByCondition2: ExpressionFilter | undefined;
if (requestedBy) {
  const idsByTag = requestedBy.groupBy((id) => tagFromId(id));
  requestedByCondition2 = {
    or: [user2, iu2, tpu2, h2].map((a) => a.id.in(idsByTag[tagFromAlias(a)])),
  };
}

// Build poly subject type condition using per-component m2o fields
let subjectTypeCondition: ExpressionFilter | undefined;
if (subjectType) {
  const { components } = getMetadata(Approval).fields["subject"] as PolymorphicField;
  const componentConditions = subjectType
    .map((type) =>
      getApprovalSubjectConstructors()
        .map((subject) => getMetadata(subject))
        .find((meta) => meta.type === pascalCase(type)),
    )
    .map((meta) => components.find((c) => c.otherMetadata() === meta)!)
    // Each component column is a separate m2o field → use raw condition for IS NOT NULL
    .map(({ columnName }) => rawCondition(`appr."${columnName}" IS NOT NULL`, [], [appr]));
  subjectTypeCondition = { or: componentConditions };
}

const approvals = await em.query({
  select: appr,
  from: appr,
  join: [
    // These joins mirror the `requestedBy` traversal in the original where clause
    appr.on(user2.approval),      // however requestedBy is structured
    user2.leftOn(iu2.user),
    user2.leftOn(tpu2.user),
    user2.leftOn(h2.user),
  ],
  where: {
    and: [
      appr.requestedAt.eq(toDatetimeValueFilter(requestedAt)),   // or use raw filter helpers
      appr.dueOn.eq(toDateValueFilter(dueOn)),
      appr.status.eq(calculatedApprovalStatus),
      // Spread in the requestedBy and subjectType conditions
      ...(requestedByCondition2 ? [requestedByCondition2] : []),
      ...(subjectTypeCondition ? [subjectTypeCondition] : []),
    ],
  },
  orderBy: [asc(appr.dueOn)],
  limit: 300,
});
// → Approval[]

return { pageInfo: new StaticPageInfo(false, 0), approvals };
