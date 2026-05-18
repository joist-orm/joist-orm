
    const [d, pda] = aliases(Document, ProjectDocumentAssociation);
    const query = buildQuery(knex, Document, {
      where: { projectDocumentAssociations: pda, as: d },
      conditions: { or: [pda.project.in(projects), d.parent.in(projects)] },
      limit,
    });
    // We use a custom order by so that we get favorited documents first, then relevant categories, and finally just
    // most recently created documents
    const order = ["is_favorite DESC NULLS LAST", "created_at DESC", "id DESC"];

    if (categories.nonEmpty) {
      void query.select(knex.raw(`category_id in (:ids:) as is_relevant_category`, { ids: categories }));
      order.splice(1, 0, "is_relevant_category DESC NULLS LAST");
    }
    void query
      .clear("order")
      .select(knex.raw(`(favorited_by->>'${user.id}') IS NOT NULL as is_favorite`))
      .orderByRaw(order.join(", "));
    const results = await em.loadFromQuery(Document, query);
