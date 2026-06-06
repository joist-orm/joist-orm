---
title: Simplest Possible Closure Tables
slug: blog/simplest-possible-closure-tables
date: 2027-06-04
authors: shaberman
tags: []
excerpt: Joist-driven implementation of closure tables as an example of our declarative business logic.
---

Joist is a TypeScript ORM that lets you declaratively implement your business logic, which we explore in this post by examining this snippet of code:

```ts
class Employee {
  /** Create an employee -> all transitive managers closure table. */
  readonly managersClosure: ReactiveManyToMany<Employee, Employee> =
    hasReactiveManyToMany(
      "managersRecursive",
      (e) => [e, ...e.managersRecursive.get],
    );
}
```

Which we assert is the simplest possible implementation of closure tables. 🤯

It achieves this by combining two of Joist's primitives:

* Recursive collections (the `reportsRecursive`) using recursive CTEs, and
* Reactive infrastructure like `hasReactiveManyToMany`

We'll look at each of these, and also explain closure tables while we're at it.

## Closure Tables

Closure tables are a niche but [well](https://www.percona.com/blog/moving-subtrees-in-closure-table/) [known](https://www.red-gate.com/simple-talk/) way to store hierarchical data (trees, or arbitrarily nested parent/child data) in a relational database that makes it easy to query "up & down the entire tree" with just regular/fast joins.

For example, if we have an `employees` table with a `manager_id` column, some employees might have "just one manager" (they report directly to the CEO), while other employees might have "their manager, their manager's manager, their manager's manager's manager", etc. up to the CEO.

Historically, given the "static" nature of SQL queries (i.e. no `for` loops), queries for "all the transitive managers for this employee" was difficult/impossible to query using just the `manager_id` column by itself. 

:::tip[Recursive CTEs]

...at least until `WITH RECURSIVE` CTEs came along!

We'll look at those soon.

:::

Closure tables are a pattern of storing data that make these "find all transitive managers" queries easy.

They do this by, at write-time when `manager_id` is changed, duplicating each hop from an employee to every single transitive manager as _derived_ data--they don't replace the `manager_id` column, they're _calculated from it_.

For an example like `Fred` reports to `Bob` reports to `Jill`, the closure table approach stores:

* `fred.managersClosure=[fred, bob, jill]`
* `bob.managersClosure=[bob, jill]`
* `jill.managersClosure=[jill]`

I'm purposefully representing these as "a collection of 'all managers' on each employee object" because I think that's the easiest to mental model to reason about.

Most articles jump to "what does the `managers_closure` table look like in the database", which is something like:

<div style={{ padding: '24px' }}>
  <img src="/images/managers_closure_table_named_annotations.svg" />
</div>

Which is correct, but just harder to initially reason about in my opinion.

Now with this `managers_closure` table we can make the "find all managers" with a single "static" SQL query with a single `INNER JOIN`:

```sql
SELECT e.*
FROM managers_closure mc
JOIN employees e ON e.id = mc.ancestor_id
WHERE mc.descendant_id = :employee_id
AND mc.ancestor_id <> mc.descendant_id;
```

When we execute this query with `:employee_id = fred`, it returns two rows:

* `id=2 descendant_id=fred ancestor_id=bob`
* `id=3 descendant_id=fred ancestor_id=jill`

And so successfully return "all the managers", regardless of "how many levels up" we had to go.

## ...but we have Recursive CTEs

Most readers will probably have pointed out that "PostgreSQL solved this" by adding `WITH RECURSIVE` CTEs.

Which is true!

In modern PostgresQL, we can often skip the `managers_closure` table with the following updated query, where the `WITH RECURSIVE` basically acts as "the missing `for` loop" to walk up a variable number of levels, using only the `manager_id` column:

```sql
WITH RECURSIVE managers AS (
    -- anchor: the employee's direct manager
    SELECT manager_id
    FROM employees
    WHERE id = :employee_id

    UNION ALL

    -- recursive: step up to each manager's manager
    SELECT e.manager_id
    FROM employees e
    JOIN managers m ON e.id = m.ancestor
)
SELECT ancestor
FROM managers
WHERE ancestor IS NOT NULL;

```

I'll defer to [other blog posts](https://medium.com/swlh/recursion-in-sql-explained-graphically-679f6a0f143b) to explain the syntax, but this is really great!

Joist already has first-class support for `RECURSIVE` CTEs, in that anytime `joist-codegen` sees a "self-referential foreign-key" (i.e. the `manager_id` column that points back at its same `employees` table), we automatically create a `...Recursive` relation that is powered by a `RECURSIVE` CTE under the hood, i.e.:

```ts
const fred = await em.load(Employee, "e:1");
// outputs bob
console.log(await fred.manager.load());
// outputs [bob, jill]
console.log(await fred.managersRecusive.load());
````

Where the `load()` method is issuing a SQL statement exactly like the `WITH RECURSIVE` CTE above, and getting us all managers resurively. 🎉 

Joist's built-in support puts the power of `RECURSIVE` CTEs at your finger-tips--just a `.load()` call away. 😀

## ...so why still use Cloure Tables?

So, with this great PostgreSQL feature, are closure tables still applicable?

For us, the answer is usually no--unless you have a very high-performance query you need to optimize. 🚀

For example, internally we're building an RBAC-based auth system where permission grants "inherit" down a stack of `AuthScope` buckets--like if Jill is the CEO, she can read the salary data of Bob and Fred, Bob can ready the salary data of Fred, etc.

In this setup, we'll issue "what are your transitive auth permissions?" basically all the same, and need these queries to be extremely fast, i.e. easy for the Postgres query planner to optimize & execute.

So, for this use case, we think it's worth the write-time cost of generating an old-school `auth_scope_closures` table, and are using Joist to drive it.

## Closure Tables in Joist

Getting back to Joist, our goal is declarative business logic--what's "the most declarative way" to define closure tables?

The "closure" is the manager themselves (a self-relationship) plus all their transitive children.

Joist has two features that we can combine to achieve this:

- Reactive m2m tables allow us to declare "the input data" of our m2m & Joist will automatically recalc our function any time the input changes, and
- Recursive collections that allow us to have both `employee.reports` and `employee.reportsRecursive` to read all transitives up/down collections

  (Under the hood, Joist's recursive collections use the same `WITH RECURSIVE` CTE queries to load the tree of data in 1 SQL query.)

Putting them together looks gets back to our snippet from the beginning of the post:

```ts
class Employee {
  /** Example of a closure table. */
  readonly reportsClosure: ReactiveManyToMany<Employee, Employee> = hasReactiveManyToMany(
    // Recalc this anytime our _recursive_ reports change
    "reportsRecursive",
    // Append the manager to the list of reports
    (e) => [e, ...e.reportsRecursive.get],
  );
}
```

...and that's it.

## Results

What have we achieved?

We're still using Postgres's `WITH RECURSIVE` CTE queries (via the `reportsRecursive` collection), but we've moved the CTE query _out of the read path_, and _into the write path_, which will be evaluated much less frequently.

Our reads can leverage this "just a join" `reportsClosure` table/collection:

```ts
// Find all transitive reports for an employee e:1
const allReports = await em.find(Employee, { reportsClosure: "e:1" });
```

This is admittedly a simple query anyway, but we have `reports_closure` available to us in other complex/high-volumn queries as well.
