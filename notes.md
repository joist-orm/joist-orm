
Tagged ids for table-per-class

If `SmallPublisher extends Publisher`, modeled as two `small_publishers` and `publishers` tables, what should the tagged id be of `smallPublisher.id`?

1. Same tag across all subtypes
   * Pro: can avoid teaching `sameEntity` that `p:1` === `sp:1`
   * Con: cannot know, when creating a tag for a FK, which type to use; does the `publisher_id=1` point to a `LargePublisher` or `SmallPublisher`? Should the key be `sp:1` or `lp:1`? We can't know w/o probing the type.
   * Con: Having `p:1` doesn't guarantee the constructor is `Publisher`, it could be `SmallPublisher`
2. Per-subtype tags
   * Pro: Neat to just glance at an id and know the subtype
   * Pro: Keeps tag -> correct constructor convention
   * Con: Foreign keys would need to support either `sp:1` or `lp:1` runtime tag checks
   * Con: Complicates `sameEntity` for tag values of `p:1` and `sp:1`
3. Subdivide the keyspace by type, odds are small publishers, even are large publishers
   * Con: Only works when knowing the number of subtypes up-front. Recoding would be impossible.
4. Add an extra `kind` column to the base table that is the subtype+id like `kind=sp:1`. FKs go the kind.
