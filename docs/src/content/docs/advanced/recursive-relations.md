---
title: Recursive Relations
description: Documentation for Recursive Relations
sidebar:
  order: 5
---

### Overview

A common pattern in domain modeling is nested parent/child relationships, i.e. a parent that has multiple children, which themselves can have multiple grand children.

For example an `employees.manager_id` FK that generates normal many-to-one and one-to-many relations:

```ts
class Employee {
  manager: Reference<Employee, Employee>;
  reports: Collection<Employee, Employee[]>;
}
```

These relations fetch "the immediate manager" and "the immediate reports", but often you want to fetch "the whole tree", i.e. a manager and all of their reports recursively.

This has historically been difficult in relational databases (requiring approaches like `lpath` and closure tables, see [this blog post](https://www.ackee.agency/blog/hierarchical-models-in-postgresql)), but now can be done in Postgres using recursive CTEs.

### Recursive Relations

Whenever Joist sees a foreign key that is self-referential, Joist will automatically create recursive relations, in addition to the "immediate" o2m and m2o, i.e. for a `employees.manager_id` FK, you'll get:

```ts
class Employee {
  // immediate relations
  manager: Reference<Employee, Employee>;
  reports: Collection<Employee, Employee[]>;
  // recursive relations
  managersRecursive: Reference<Employee, Employee>;
  reportsRecursive: Collection<Employee, Employee[]>;
}
```

And if you call:

```ts
await m1.reportsRecursive.load();
```

Joist will issue a single SQL call to fetch all `m1`'s reports, and all their reports, etc. in a single query.

This method is also automatically batched, so if you invoke it in a loop, or a validation rule, or other business logic, for multiple managers at once, it will still create a single SQL call.

### Consistent View

As with other Joist relations, the recursive relations provide a "consistent view" of the entity graph.

For example, if you've modified the employee/manager relationship for any employees in the current `EntityManager` unit of work, and then later call either `managersRecursive` or `reportsRecursive`, we will load the recursive data from the database (if not already loaded), and also apply any WIP, uncommitted changes to the hierarchy.

This ensures your code can rely on the recursive relations to be up-to-date, and should dramatically simplify reasoning about/enforcing rules while persisting changes.

### Cycle Detection

Joist's recursive relations currently always reject cycles.

Note that we do not automatically add an "enforce no cycles" validation rule to recursive relations by default, but if you do access any relation (either recursive parents or recursive children) that does have a cycle, we'll throw an error.

Given this, it's advised to add your own cycle-preventing validation rules.

This behavior should likely be configurable (i.e. to allow cycles), but has not been implemented yet.

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
