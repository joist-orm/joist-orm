
      const [ps, c, b, t] = aliases(ProjectStage, Commitment, Bill, Task);
      const billQuery = buildQuery(knex, Bill, {
        where: { as: b, tradePartner: tp, projectStage: ps },
        conditions: {
          or: [
            b.status.in([BillStatus.Reversed, ...BilledStatuses]),
            {
              and: [
                b.source.eq(BillSource.ClickToPay),
                b.status.in([BillStatus.PendingApproval, BillStatus.ChangesRequested]),
              ],
            },
          ],
        },
        pruneJoins: false,
        keepAliases: ["ps"],
      });
      // converted from canViewCommitmentLike in tradePartnerRules.ts
      const commitmentQuery = buildQuery(knex, Commitment, {
        where: { as: c, tradePartner: tp, projectStage: ps },
        conditions: { and: [c.status.ne(CommitmentStatus.Draft), c.status.ne(CommitmentStatus.Uploaded)] },
        pruneJoins: false,
        keepAliases: ["ps"],
      });
      const tasksQuery = buildQuery(knex, Task, {
        where: { tradePartner: tp },
      });
      const availabilityRequestsQuery = buildQuery(knex, TradePartnerAvailabilityRequest, {
        where: { tradePartner: tp, task: t },
        pruneJoins: false,
        keepAliases: ["t"],
      });
      [billQuery, commitmentQuery, tasksQuery, availabilityRequestsQuery].forEach((query, i) =>
        query
          .clearSelect()
          .clearOrder()
          .select(knex.raw(`DISTINCT ${i > 1 ? "t" : "ps"}.project_id`)),
      );
      const projectObjects = await [billQuery, commitmentQuery, tasksQuery, availabilityRequestsQuery].asyncFlatMap(
        async (q) => await q,
      );

// === em.query version ===
//
// This runs 4 queries to collect DISTINCT project_ids from different entity paths,
// then combines the results. Each query is a simple POJO select with distinct.
//
// UNION is deferred, but this pattern (run N queries, flatMap results) works fine
// as separate em.query calls. No new gaps — this is straightforward POJO mode.

const [ps2, c2, b2, t2] = aliases(ProjectStage, Commitment, Bill, Task);
const [tpar] = aliases(TradePartnerAvailabilityRequest);

// Bills → project_id via projectStage
const billProjectIds = await em.query({
  select: { projectId: ps2.projectId },
  from: b2,
  join: [b2.on(ps2.bill)],  // however bill→projectStage FK is structured
  where: {
    and: [
      b2.tradePartner.eq(tp),
      {
        or: [
          b2.status.in([BillStatus.Reversed, ...BilledStatuses]),
          { and: [b2.source.eq(BillSource.ClickToPay), b2.status.in([BillStatus.PendingApproval, BillStatus.ChangesRequested])] },
        ],
      },
    ],
  },
  distinct: true,
});

// Commitments → project_id via projectStage
const [ps3, c3] = aliases(ProjectStage, Commitment);
const commitmentProjectIds = await em.query({
  select: { projectId: ps3.projectId },
  from: c3,
  join: [c3.on(ps3.commitment)],
  where: {
    and: [
      c3.tradePartner.eq(tp),
      c3.status.ne(CommitmentStatus.Draft),
      c3.status.ne(CommitmentStatus.Uploaded),
    ],
  },
  distinct: true,
});

// Tasks → project_id directly
const [t3] = aliases(Task);
const taskProjectIds = await em.query({
  select: { projectId: t3.projectId },
  from: t3,
  where: { and: [t3.tradePartner.eq(tp)] },
  distinct: true,
});

// Availability requests → project_id via task
const [t4] = aliases(Task);
const [tpar2] = aliases(TradePartnerAvailabilityRequest);
const arProjectIds = await em.query({
  select: { projectId: t4.projectId },
  from: tpar2,
  join: [tpar2.on(t4.availabilityRequest)],
  where: { and: [tpar2.tradePartner.eq(tp)] },
  distinct: true,
});

const allProjectIds = [
  ...billProjectIds, ...commitmentProjectIds,
  ...taskProjectIds, ...arProjectIds,
].map((r) => r.projectId).unique();
// → ProjectId[]
