
# joist-plugin-join-preloading

This plugin implements `json_aggregate`-based preloading of entities.

It's currently WIP and _might_ become part of a "Joist Pro" commercial offering.

As such, everything in this directory is not MIT licensed, but is "wip commercially licensed".

## Todo

* Finish adding `beforeFind` calls to dataloaders
  * findOrCreateDataloader
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

