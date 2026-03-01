
  const query = buildQuery(knex, Item, {
    where: { id: itemId, costCode: costCodeId },
    pruneJoins: false,
  })
    // A given Item could have multiple ITIs in the template...
    .join("item_template_items as iti", { "iti.item_id": "i.id" })
    .join("item_template_item_versions as itiv", { "itiv.scope_id": "iti.id" })
    // Exclude ITIVs that have been removed
    .whereNot("itiv.scope_change_type_id", ScopeChangeTypes.getByCode(ScopeChangeType.Removed).id)
    .join("item_templates as it", { "it.id": "itiv.template_id" })
    // There could be zero-or-multiple BCLIs for this ITI's Bid ITI...
    .leftJoin("bid_contract_line_items as bcli", { "bcli.item_template_item_id": "iti.bid_item_template_item_id" })
    .whereIn("it.development_id", deTagIds(getMetadata(Development), developmentIds))
    .where("it.is_latest_active", true)
    .distinct("i.id");

  if (itemTemplateItemId) {
    void query.whereIn("iti.id", deTagIds(getMetadata(ItemTemplateItem), itemTemplateItemId));
  }

  if (itemTemplateStatus) {
    void query.whereIn("it.status_id", itemTemplateStatus);
  }

  if (excludeItemTemplateItemId) {
    // Get all originalVariations for excludeItemTemplateItemId
    const excludeItisWithVariations = await em.loadAll(ItemTemplateItem, excludeItemTemplateItemId, {
      original: "originalVariations",
    });

    // Get all the variations that have the same majorHash as the iti
    const allExcludeItemTemplateItemIds = excludeItisWithVariations
      .flatMap((excludeIti) =>
        excludeIti.original.get.originalVariations.get.filter(
          (variation) => excludeIti.majorHash === variation.majorHash,
        ),
      )
      .unique();

    void query.whereNotIn("iti.id", deTagIds(getMetadata(ItemTemplateItem), idsOf(allExcludeItemTemplateItemIds)));
  }

  if (readyPlanId) {
    void query.whereIn("it.ready_plan_id", deTagIds(getMetadata(ReadyPlan), readyPlanId));
  }

  if (readyPlanOptionId) {
    void query.leftJoin("item_template_item_rpos AS iti_m2m_rpo", "iti.id", "iti_m2m_rpo.item_template_item_id");
    void query.whereIn("iti_m2m_rpo.ready_plan_option_id", deTagIds(getMetadata(ReadyPlanOption), readyPlanOptionId));
  }

  const scopeChangeUpdated = [ScopeChangeType.Add, ScopeChangeType.Major, ScopeChangeType.Replace].map(
    (s) => ScopeChangeTypes.getByCode(s).id,
  );

  // We define `needsBid` as true if the scope change type is Add, Major, or Replace and there is no BCLI
  void query
    .select(
      knex.raw(
        `
  case
    when itiv.scope_change_type_id in (${scopeChangeUpdated.map(() => "?").join(", ")}) and bcli is null then true
    else false
  end as needs_bid
  `,
        scopeChangeUpdated,
      ),
    )
    .select("iti.bid_item_template_item_id as bid_template_item_id");

  const result = await query;

  const groupedResult = result.groupBy((r) => r.id);

  const items = await em.loadFromRows(Item, result);

// === em.query version ===
//
// GAPS IDENTIFIED:
//
// 1. Non-FK LEFT JOIN: `bcli.item_template_item_id = iti.bid_item_template_item_id`
//    is not a standard FK→PK join. We need `.leftOn()` to accept an arbitrary
//    ExpressionCondition, not just an EntityAlias FK reference.
//    Proposed: `bcli.leftOn(bcli.itemTemplateItem.eq(iti.bidItemTemplateItem))`
//    or more generally: `bcli.leftOn(rawCondition(...))`
//
// 2. Entity + extra computed columns: The original returns Item entities PLUS
//    `needs_bid` and `bid_template_item_id`. Our plan supports entity mode OR POJO
//    mode, not both. Proposed solution: use POJO mode and load entities from IDs.
//
// 3. Conditional LEFT JOIN: `readyPlanOptionId` conditionally adds another join.
//    In em.query, the join array is static. We'd need to conditionally include it.
//    This works with `...(readyPlanOptionId ? [iti.leftOn(itiRpo.itemTemplateItem)] : [])`.
//
// 4. DISTINCT: The original uses `.distinct("i.id")`. We have `distinct: true` in the
//    plan but need to verify it works with entity mode. May need `DISTINCT ON (i.id)`.

const [i, iti, itiv, it, bcli] = aliases(
  Item, ItemTemplateItem, ItemTemplateItemVersion, ItemTemplate, BidContractLineItem,
);
// Conditionally create alias for m2m join table
const itiRpo = readyPlanOptionId ? alias(ItemTemplateItemRpo) : undefined;

const scopeChangeUpdated2 = [ScopeChangeType.Add, ScopeChangeType.Major, ScopeChangeType.Replace].map(
  (s) => ScopeChangeTypes.getByCode(s).id,
);

// Pre-compute exclude IDs (same as original)
let excludeIds: ItemTemplateItemId[] | undefined;
if (excludeItemTemplateItemId) {
  const excludeItisWithVariations = await em.loadAll(ItemTemplateItem, excludeItemTemplateItemId, {
    original: "originalVariations",
  });
  excludeIds = idsOf(
    excludeItisWithVariations
      .flatMap((excludeIti) =>
        excludeIti.original.get.originalVariations.get.filter(
          (variation) => excludeIti.majorHash === variation.majorHash,
        ),
      )
      .unique(),
  );
}

const results = await em.query({
  select: {
    id: i.id,
    needsBid: rawExpr<boolean>(
      `CASE WHEN itiv.scope_change_type_id IN (${scopeChangeUpdated2.map(() => "?").join(", ")}) AND bcli IS NULL THEN true ELSE false END`,
      scopeChangeUpdated2,
    ),
    bidTemplateItemId: iti.bidItemTemplateItemId,
  },
  from: i,
  join: [
    i.on(iti.item),                                          // iti.item_id = i.id
    iti.on(itiv.scope),                                      // itiv.scope_id = iti.id
    itiv.on(it.id),                                          // it.id = itiv.template_id  (GAP: need non-PK FK join)
    // GAP: non-FK left join — need .leftOn() with arbitrary condition
    bcli.leftOn(bcli.itemTemplateItem.eq(iti.bidItemTemplateItem)),
    // Conditional join
    ...(itiRpo ? [iti.leftOn(itiRpo.itemTemplateItem)] : []),
  ],
  where: {
    and: [
      i.id.in(itemId),
      i.costCode.eq(costCodeId),
      itiv.scopeChangeType.ne(ScopeChangeType.Removed),
      it.development.in(developmentIds),
      it.isLatestActive.eq(true),
      // Conditional filters — undefined values are pruned
      iti.id.in(itemTemplateItemId),
      it.status.in(itemTemplateStatus),
      excludeIds ? iti.id.nin(excludeIds) : undefined,
      it.readyPlan.in(readyPlanId),
      itiRpo ? itiRpo.readyPlanOption.in(readyPlanOptionId) : undefined,
    ],
  },
  distinct: true,
});
// → { id: ItemId; needsBid: boolean; bidTemplateItemId: ItemTemplateItemId }[]

// Load entities from the POJO results
const items2 = await em.loadAll(Item, results.map((r) => r.id));
const groupedResult2 = results.groupBy((r) => r.id);
