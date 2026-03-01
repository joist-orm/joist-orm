
  const query = buildQuery(knex, ChangeRequest, {
    where: {
      id,
      status,
      changeTypes,
      source,
      createdBy: {
        id: createdByUserIds.nonEmpty ? createdByUserIds : undefined,
        internalUser: { id: createdByInternalUserIds.nonEmpty ? createdByInternalUserIds : undefined },
      },
      groups: group,
    },
    orderBy: orderBy ? convertNulls(orderBy) : { id: "ASC" },
    offset: page?.offset ?? undefined,
    limit: page?.limit ?? undefined,
    keepAliases: ["cr"],
  });

  // Establish the joins needed to traverse the polymorphic `ChangeRequest.scope` relationship.
  if (market || development || project) {
    void query
      .leftJoin("change_request_scopes AS crs", "crs.change_request_id", "cr.id")
      .leftJoin("projects AS p", "p.id", "crs.target_project_id")
      .leftJoin("developments AS d", "d.id", "crs.target_development_id")
      .whereNull("crs.deleted_at");
  }

  if (market) {
    filterQueryByMarkets(query, market, { projects: "p", developments: "d" });
  }

  if (project) {
    void query.whereIn("p.id", deTagIds(getMetadata(Project), project));
  }

  if (development) {
    const developmentIds = deTagIds(getMetadata(Development), development);

    // Join projects to developments through cohorts
    void query.leftJoin("cohorts as co", "p.cohort_id", "co.id");

    void query.andWhere((builder) => {
      void builder.whereIn("d.id", developmentIds).orWhereIn("co.development_id", developmentIds);
    });
  }

  if (projectWithDevelopment) {
    // Find the change requests that are associated with the given projects or it's developments
    const projectIds = deTagIds(getMetadata(Project), projectWithDevelopment);

    // Join change request to scopes
    void query.leftJoin("change_request_scopes AS crs", "crs.change_request_id", "cr.id").whereNull("crs.deleted_at");
    void query.andWhere(
      (builder) =>
        void builder
          .whereIn("crs.target_project_id", projectIds)
          .orWhereIn(
            "crs.target_development_id",
            knex
              .select("d.id")
              .from("developments AS d")
              .join("cohorts AS c", "d.id", "c.development_id")
              .join("projects AS p", "c.id", "p.cohort_id")
              .whereIn("p.id", projectIds),
          ),
    );
  }

  if (businessFunction) {
    // Join change requests to assets and assets to business functions
    void query
      .leftJoin("change_request_to_change_request_asset AS cr2cra", "cr2cra.change_request_id", "cr.id")
      .leftJoin("change_request_assets AS cra", "cra.id", "cr2cra.change_request_asset_id")
      .leftJoin("business_function_type AS bft", "bft.id", "cra.function_type");
    // And filter on the business function
    void query.whereIn("bft.code", businessFunction);
  }

  // Custom query to be able to filter through the Approval.subject poly relationship
  if (internalUser && internalUser.nonEmpty) {
    const detTaggedInternalIds = deTagIds(getMetadata(InternalUser), internalUser);

    void query
      // Approver Assignees
      .leftJoin("approvals", "approvals.subject_change_request_id", "cr.id")
      .leftJoin("approvers", "approvers.approval_id", "approvals.id")
      // Change Request Todo Assignees (stores User ids, so must join through internal_users)
      .leftJoin("change_request_to_dos", "change_request_to_dos.change_request_id", "cr.id")
      .leftJoin("to_do_assignees", "to_do_assignees.to_do_id", "change_request_to_dos.id")
      .leftJoin("internal_users AS td2iu", "td2iu.user_id", "to_do_assignees.user_id")
      // Similarly, ChangeRequest.created_by is a User id, so create a separate join through internal_users
      .leftJoin("internal_users AS cr2iu", "cr2iu.user_id", "cr.created_by");

    void query.andWhere((builder) => {
      void builder
        .whereIn("approvers.user_internal_user_id", detTaggedInternalIds)
        .orWhereIn("td2iu.id", detTaggedInternalIds)
        .orWhereIn("cr2iu.id", detTaggedInternalIds);
    });
  }

  // Always distinct on the ChangeRequest.id
  // We do this because knex doesn't dedupe disticts
  void query.clear("select").distinct("cr.id", "cr.*");
