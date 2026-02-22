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

### Consistent View

As with all Joist relations, recursive relations provide a "consistent view" of the entity graph that is always in sync with any WIP/un-flushed mutations you've made.

For example, if you've modified the employee/manager relationship for any employees in the current `EntityManager`, and then later call either `managersRecursive` or `reportsRecursive`, we will load the recursive data from the database (if not already loaded), and also apply any WIP, uncommitted changes to the hierarchy.

This ensures your code can rely on the recursive relations to be up-to-date, and should dramatically simplify reasoning about/enforcing rules while persisting changes.

### Cycle Detection

Recursive relations always fail (throw a `RecursiveCycleError` exception) when they detect cycles during `.get` calls.

We do not automatically add validation rules to enforce no cycles, but you can opt-in to cycle detection during validation by using `addCycleMessage`:

```ts title=Employee.ts
config.addCycleMessage(
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
