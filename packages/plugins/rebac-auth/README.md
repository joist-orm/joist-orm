# joist-plugin-rebac-auth

Rebac Auth
==========

### Thesis

This plugin builds authorization (authz) directly into the data layer, similar to Ent's [private policies]()

The general assertion is that authz can be done either:

* Endpoint-based / command-based
* Data-layer-based
* Some mix of the two (i.e. graphql-shield)

Historically we implemented graphql-shield type auth, which due to GraphQL was not true endpoint-based auth, but also was not "at the data-layer".

Because of this, we ended up having to have auth logic in two places:

* The endpoint to check "can you access this field", as well as
* In the data-layer to filter "can you access this row"


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

