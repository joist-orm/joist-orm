---
title: Unit of Work
---

If you issue the same `EntityManager.find(Entity, { ...where... })` call multiple times within a single unit of work, the database query will only be issued once, and then the cached value used for subsequent calls.

If you do an `EntityManager.flush`, that will reset the find cache b/c the commit may have caused the cached query results to have changed.

Note that this is not a shared/second-level cache, i.e. shared across multiple requests to your webapp/API, which can be a good idea but means you have to worry about cache invalidation and staleness strategies.

This cache is solely for queries issued with the current unit of work, and it is thrown away/re-created for each new Unit of Work, so there should not be any issues with stale data or need to invalidate the cache (beyond what Joist already does by invalidating it on each `EntityManager.flush()` call).

(Pedantically, currently Joist's Unit of Work does not currently open a transaction until `flush` is started, so without that transactional isolation, Joist's UoW find cache may actually be "hiding" changed results (between `find` 1 and `find` 2) than if it were to actually re-issue the query each time. That said, a) ideally/at some point Joist's UoW will use a transaction throughout, such that this isolation behavior of not noticing new changes is actually a desired feature (i.e. avoiding non-repeatable reads), and b) UoWs are assumed to be extremely short-lived, i.e. per request, so you should generally not be trying to observe changed results between `find` calls anyway.)
