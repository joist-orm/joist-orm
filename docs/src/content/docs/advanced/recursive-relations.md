---
title: Recursive Relations
description: Documentation for Recursive Relations
sidebar:
  order: 5
---

### Overview

A common pattern in domain models is nested parent/child relationships, i.e. a parent (a manager `Employee`) that has multiple children (their direct reports `Employee`s), which themselves can have multiple children (their own direct report `Employee`s).

These relationships are modeled by self-referential FKs or m2m tables, i.e.:

- A `employees.manager_id` FK for the manager/reports example, or
- A `task_to_task_dependencies` m2m table that tracks a task having other tasks as dependencies

When Joist sees self-referential relations, it automatically creates both the "immediate" relations, and "recursive" relations that will fetch the whole tree of parents/children in a single SQL call:

```ts
class Employee {
  // standard "immediate" relations
  manager: Reference<Employee, Employee>;
  reports: Collection<Employee, Employee[]>;
  // additional "recursive" relations
  managersRecursive: Reference<Employee, Employee>;
  reportsRecursive: Collection<Employee, Employee[]>;
}
```

Such that we can use `reportsRecursive` to fetch all of a manager's reports, and all their reports, etc. in a single method call _and single SQL query_:

```ts
await m1.reportsRecursive.load();
```

Joist uses Postgres's recursive CTE support to implement the recursive relations, so the above code will result in a single SQL query that fetches all of `m1`'s reports, and all their reports, etc.

:::tip

The `reportsRecursive.load()` method is also automatically batched, so if you invoke it in a loop, or a validation rule, or other business logic, it will still create a single SQL call. 🚀

:::

:::tip

Modeling Trees in relational database has historically been a challenge, requiring more complex approaches like `lpath` and closure tables, see [this blog post](https://www.ackee.agency/blog/hierarchical-models-in-postgresql)), but now can be done in Postgres using recursive CTEs. 🎉 

:::

### Filtering with `em.find`

Generated recursive collections also appear in entity filter types:

```ts
// Employees with Alice anywhere in their manager chain.
await em.find(Employee, { managersRecursive: { name: "Alice" } });

// Employees with Bob anywhere among their direct or indirect reports.
await em.find(Employee, { reportsRecursive: { name: "Bob" } });

// Employees without any direct or indirect reports.
await em.find(Employee, { reportsRecursive: false });
```

The nested filter checks related entities at any depth. For example, `managersRecursive: { name: "Alice" }` can match Alice through Bob; Bob does not also have to be named Alice. An entity never counts as its own manager or report. Filters can use entities, IDs, arrays, scopes, nested relations, and `and`/`or`. Multiple conditions within one nested filter must match the same related entity.

`true` requires a nonempty recursive collection; `false` or `null` requires an empty one. `undefined` and empty filter objects impose no constraint. `{ ne: employee }` requires some reachable employee other than that employee, following ordinary collection inequality semantics.

Joist starts a recursive CTE with the related entities that match the filter, follows relationships back to their collection owners, and filters the outer query with `EXISTS`. This avoids duplicate results and allows normal counting, pagination, and population. The recursive filter itself does not load the collection.

Concurrent finds with the same filter structure are automatically batched, even when their recursive filter values differ. Each find's tag stays with its matching related entities as Joist follows relationships, so nested recursive filters and overlapping paths cannot mix results between finds. Counts, ID queries, and paginated finds also share their recursive traversals within a batch.

Recursive filters use persisted database relationships. By default, soft-deleted related entities do not match, but Joist can follow relationships through them. For example, an employee can still match Alice as a recursive manager when Bob, the manager between them, is soft-deleted. Use `softDeletes: "include"` to include soft-deleted related entities and entities returned by the find. Cycles terminate through deduplication; filtering does not throw `RecursiveCycleError`.

Aliases cannot be exported from a recursive collection filter with `as`. Use a scope for alias conditions that only refer to the related entity and its relations. Comparisons between that related entity and an alias in the enclosing find query are not supported.

### Consistent View

As with all Joist relations, recursive relations provide a "consistent view" of the entity graph that is always in sync with any WIP/un-flushed mutations you've made.

For example, if you've modified the employee/manager relationship for any employees in the current `EntityManager`, and then later call either `managersRecursive` or `reportsRecursive`, we will load the recursive data from the database (if not already loaded), and also apply any WIP, uncommitted changes to the hierarchy.

This ensures your code can rely on the recursive relations to be up-to-date, and should dramatically simplify reasoning about/enforcing rules while persisting changes.

### Cycle Detection

Recursive relations always fail (throw a `RecursiveCycleError` exception) when they detect cycles during `.get` calls.

We do not automatically add validation rules to enforce no cycles, but you can opt-in to cycle detection during validation by using `addCycleRule`:

```ts title=Employee.ts
config.addCycleRule(
  "reportsRecursive",
  (e) => `Manager ${e.name} has a cycle in their direct reports`,
);
```

### Disabling Recursive Relations

If you don't want/need the recursive relations, you can disable them by setting `skipRecursiveRelations: true` in `joist-config.json` for the self-referencing m2o relation, i.e.:

```json
{
  "entities": {
    "User": {
      "tag": "u",
      "relations": {
        "manager": {
          "skipRecursiveRelations": true
        }
      }
    }
  }
}
```
