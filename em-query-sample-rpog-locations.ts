
    const rpogQuery = buildQuery(knex, ReadyPlanOptionGroup, {
      where: {
        as: rpog,
        versions: rpogv,
        options: { as: rpo, versions: rpov, itemTemplateItems: tliv },
      },
      conditions: {
        and: [
          rpog.readyPlan.eq(rpav.readyPlan.id),
          rpog.personalizationType.ne(null),
          ...conditions(rpog, rpogv),
          ...conditions(rpo, rpov),
          ...conditions(tli, tliv),
          tliv.materialVariant.ne(null),
        ],
      },
    })
      .clear("select")
      .select(knex.raw("rpog.id::text as id"))
      .select(knex.raw("array_agg(iti.location_id::text) as location_ids"))
      .groupBy("rpog.id") as Knex.QueryBuilder<any, { id: string; location_ids: string[] }[]>;

// === em.query version ===
//
// This maps well — it's a GROUP BY + aggregate (array_agg) returning POJOs.
//
// GAP: We need the join structure to mirror what em.find's `where` tree does implicitly
// (walking m2o/o2m relations). For em.query, the user must declare joins explicitly.
// This is verbose but unambiguous.

const [rpog, rpogv, rpo, rpov, tli, tliv, iti] = aliases(
  ReadyPlanOptionGroup, ReadyPlanOptionGroupVersion,
  ReadyPlanOption, ReadyPlanOptionVersion,
  ItemTemplateItem, ItemTemplateItemVersion, ItemTemplateItem,
);

const result = await em.query({
  select: {
    id: rpog.id,
    locationIds: arrayAgg(iti.locationId),
  },
  from: rpog,
  join: [
    rpog.on(rpogv.scope),           // rpog_versions.scope_id = rpog.id
    rpog.on(rpo.optionGroup),       // rpo.option_group_id = rpog.id
    rpo.on(rpov.scope),             // rpov.scope_id = rpo.id
    rpo.on(tli.readyPlanOption),    // tli joins via rpo (adjust FK as needed)
    tli.on(tliv.scope),             // tliv.scope_id = tli.id
    tli.on(iti.itemTemplateItem),   // iti joins to tli
  ],
  where: {
    and: [
      rpog.readyPlan.eq(rpav.readyPlan.id),
      rpog.personalizationType.ne(null),
      ...conditions(rpog, rpogv),
      ...conditions(rpo, rpov),
      ...conditions(tli, tliv),
      tliv.materialVariant.ne(null),
    ],
  },
  groupBy: [rpog.id],
});
// → { id: ReadyPlanOptionGroupId; locationIds: string[] }[]
