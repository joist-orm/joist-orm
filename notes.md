
Tagged ids

* Same tag across all subtypes
  * Pro: can know `p:1` === `sp:1` without knowing the subtype of the row
    * I.e. a FK points to publisher, should we make the key `p:1` or `sp:1`? We can't know w/o probing the type.
  * Con: Having `p:1` doesn't guarantee the constructor is `Publisher`, it could be `SmallPublisher`
* Per-subtype tags
  * Pro: Neat to just glance at an idea and know the subtype
  * Pro: Keeps tag -> correct constructor convention
  * Con: Foreign keys would need to support either `sp:1` or `lp:1` runtime tag checks
  * Con: Complicates `sameEntity` for tag values of `p:1` and `sp:1`
* Subdivide the keyspace by type, odds are small publishers, even are large publishers
  * Con: Only works when knowing the number of subtypes up-front. Recoding would be impossible.
* Have a `kind` column that is the subtype+id like `kind=sp:1`. FKs go the kind.
