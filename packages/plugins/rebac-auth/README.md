
Rebac Auth Plugin
=================

### Thesis

This plugin builds authorization (authz) directly into the ORM/data layer, similar to Ent's [privacy policies](https://entgo.io/docs/privacy/).

Stepping back, authz can generally be done as either:

1. Endpoint-based / command-based (i.e. at the `POST /users/1` level)
2. Data-layer-based (i.e. at the `SELECT * FROM users WHERE tenant_id = 1` level)
3. Some mix of the two (i.e. both endpoint-based + custom `WHERE` clauses)

Historically we implemented authz with graphql-shield, which due to GraphQL was not true endpoint-based auth, but still auth at the API layer. This meant we're still required to write the data-layer-based auth, i.e. SQL filtering.

The goal of this plugin is to provide data-layer-based auth such that:

* We won't need separate endpoint-based/command-based authz, and
* The authz is done at the ORM level, so we don't need to hand-write SQL filtering
* We leverage Joist's graph-awareness to minimize SQL-based auth checks 
  * Ideally, only a single SQL query is needed when `em.find` enters a graph, and any subsequent graph-traversal auth can be inferred

### Operations

We're currently focused on "can a user read/write this entity", where entities can be found in two fundamental ways:

* `em.find` / `em.load` uses SQL to find net-new entry point into the entity graph
   * I.e. here we have to inject a `WHERE` clause 
* `load`-ing an edge/relation from an existing entity, i.e. entity graph traversal
   * Here the goal is to skip any additional auth checks, because of Joist's graph-awareness

### Levels of Access

* Direct field read/write, i.e. user can see exactly the value of `user.email`
* Indirect field read/write, i.e. user can see value of `user.fullName`, not `user.firstName` directly
  * Only "controlled code" (async properties, reactive fields, etc. are allowed this indirect access) 
* ...internal?...like Joist itself setting defaults?

## Old Todo

This plugin implements `json_aggregate`-based preloading of entities.

It's currently WIP and _might_ become part of a "Joist Pro" commercial offering.

As such, everything in this directory is not MIT licensed, but is "wip commercially licensed".

## Todo

* Finish adding `beforeFind` calls to dataloaders
  * findOrCreateDataloader (WIP, goes through em.find already)
  * findCountDataloader
  * findByUniqueDataloader
  * manyToManyFindLoader
  * oneToManyFindLoader
* Handle beforeCreate being allowed/denied
* Handle beforeDelete being allowed/denied
* Handle beforeInvoke being allowed/denied for `hasAsyncMethods`
  * Allow code invoked within `hasAsyncMethod` to have admin rights
* Update `RebacAuthPlugin.beforeFind` to handle multiple rules per entity
  * Will need to know which one matched
* Update `RebacAuthPlugin.beforeFind` to handle m2m relations
* Add m2o & m2m tests that match the o2m tests
* Add test for o2m -> m2o | m2m loads
* Add test for m2o relation
* Add test for m2o -> o2m | m2o | m2m loads
* Add test for m2m relation
* Add test for m2m -> o2m | m2o | m2m loads
* Add test for going "back up" with o2m | m2o | m2m

## Post MVP

* Support non-primitive `where` clauses in the auth rule (i.e. add new tables)

