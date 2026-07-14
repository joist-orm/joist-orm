
    const query = buildQuery(knex, FeatureFlag, { where: {} }).distinct("type_id");
    const usedFeatureFlagTypes = (await em.loadFromQuery(FeatureFlag, query)).map((it) => it.type);
    const allFeatureFlagTypes = FeatureFlagTypes.getValues();
