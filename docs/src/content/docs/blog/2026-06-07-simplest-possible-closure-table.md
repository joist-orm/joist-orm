---
title: Simplest Possible Closure Tables
slug: blog/simplest-possible-closure-tables
date: 2027-06-07
authors: shaberman
tags: []
excerpt: Joist-driven implementation of closure tables as an example of our declarative business logic.
---

Joist is a TypeScript ORM that lets you declaratively implement your business logic, which we explore in this post by examining this snippet of code:

```ts
class Employee {
  /** Create an employee -> all transitive managers closure/m2m table. */
  readonly managersClosure: ReactiveManyToMany<Employee, Employee> =
    hasReactiveManyToMany(
      "managersRecursive",
      (e) => [e, ...e.managersRecursive.get],
    );
}
```

Which we assert is the simplest possible implementation of closure tables. 💥

It achieves this by combining two of Joist's primitives:

* Recursive collections (the `managersRecursive` relation), and
* Reactive infrastructure like `hasReactiveManyToMany`

We'll look at each of these, and also explain closure tables while we're at it.

## Closure Tables

Closure tables are a niche but [well](https://www.percona.com/blog/moving-subtrees-in-closure-table/) [known](https://www.red-gate.com/simple-talk/) way to store hierarchical data (trees, or arbitrarily nested parent/child data) in a relational database that makes it easy to query "up or down multiple levels of the tree" with a single regular/fast join.

For example, if we have an `employees` table with a `manager_id` column, some employees might have "just one manager" (they report directly to the CEO), while other employees might have "their manager, their manager's manager, their manager's manager's manager", etc. up to the CEO.

Historically, given the "static" nature of SQL queries (i.e. no `for` loops), queries for "all the transitive managers for this employee" were difficult/impossible to query using just the `manager_id` column by itself. 

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

I'm purposefully representing these as "each employee has a collection of 'all their managers'" because I think that's the easiest to mental model to reason about.

In contrast, most closure table articles jump to "what does the `managers_closure` table look like in the database", which is something like:

<div style={{ padding: '24px' }}>
  <img src="/images/managers_closure_table_named_annotations.svg" />
</div>

Which is correct, but for me was hard to initially reason about.

Instead, I think it's most intuitive to articulate the "extra table" (the "closure table") we're adding as "each employee has a m2m between themselves and all their managers"--because that's really what it is. 😅

Now with this `managers_closure` table we can "find all managers" with a regular/boring SQL query with a single `INNER JOIN`:

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

And successfully returns "all of Fred's managers" in a simple, fast query, regardless of "how many levels up" we had to go.

:::tip[Self rows]

You'll notice the closure table pattern has each employee's `managersClosure` relation also "refer to the employee themself".

For the purposes of brevity, I'll defer to the other closure pattern materials to explain the necessity of these "reflexive closure" rows.

We're also omitting the `depth` column, since it's not necessary for the use cases we personally are interested in.

:::

## ...but Recursive CTEs!

Most readers will probably have pointed out that "PostgreSQL solved this" by adding `WITH RECURSIVE` CTEs.

Which is true!

In modern PostgresQL, we can often skip the `managers_closure` table with the following updated query, where the `WITH RECURSIVE` syntax basically acts as "the missing `for` loop" for us to walk up a variable number of levels, using only the `manager_id` column:

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
// the regular m2o relation returns bob
console.log(await fred.manager.load());
// the recursive relation returns [bob, jill]
console.log(await fred.managersRecusive.load());
````

Where the `managersRecusive.load()` method will issue a SQL statement exactly like the `WITH RECURSIVE` CTE above, and get us all their transitive managers.

And in stereotypical "never N+1" fashion, Joist will auto-batch the SQL so that we could load 100 or 1000 employees' worth of `managesRecursive` and it would still be a single SQL query. 🎉 

Joist's built-in support puts the power of `RECURSIVE` CTEs at your finger-tips--just a `load` / `populate` call away. 😀

## Why Still Use Cloure Tables?

So, with this great PostgreSQL feature, are closure tables still applicable?

For us, the answer is usually no--unless there is a very high-performance query to optimize. 🚀

For example, internally we're prototyping an RBAC-based auth system where permission grants "inherit" down a stack of "permission buckets"--like if Jill is the CEO, she can read the salary data of Bob and Fred, Bob can ready the salary data of Fred, etc.

In this setup, we'll issue "what are your transitive auth permissions?" queries basically all the time, and need these queries to be extremely fast, i.e. easy for the Postgres query planner to optimize & execute, which it is still better at doing for the "dumb/single join" of closure table queries, over recursive CTE queries.

So, for this use case, we think it's worth the write-time cost of generating an old-school `permission_bucket_closures` table, particularly if Joist can help us implement it as easily as possible.

## Closure Table Maintanence 

We skipped over one of the biggest cons of closure tables--keeping them up to date.

If we have our same chain of `Fred` is managed by `Bob` is managed `Jill` (that resulted in the 6 `managers_closure` rows in the image above), but now we add `Jan` as a layer of management between `Bob` and `Jill`, we have a lot of bookkeeping to update.

Specifically we need to add four rows:

<div style={{ padding: '24px' }}>
  <img src="/images/managers_closure_after_inserting_jan.svg" />
</div>

Which can be intuitively explained as:

1. All managers above Jan need Jan as a new report
1. All employees below Jan need Jan as a new boss,

This doesn't seem too bad--but what if the hierarchy had more than just a single `bob.manager = jan` mutation? What if several relationships changed at once?

It starts to get complicated to make it "just work"--until we lean into Joist's reactivity.

## Joist Reactivity for the Win

Let's look at the two updates we need for "Jan is a new layer of management":

1. All managers above Jan need Jan as a new report
1. All employees below Jan need Jan as a new boss,

The first important insight is to lean into our mental model of "closure tables are just fancy m2m collections", such that:

1. All managers above Jan need Jan as a new report -->
   * This is really saying set `jan.managersClosure=[jan, jill]`
   * I.e. calcing the m2m for Jan herself will "update the managers above her"
2. All employees below Jan need Jan as a new boss -->
   * This is really saying recalc `[fred, bob].managersClosure=[..., jan]`
   * I.e. re-calcing the m2m for "Jan's transitive reports""

And the second insight is that "recalculating the m2m all of Jan's _downstream_ reports" is exactly what Joist's reactivity does when it sees a `employee.manager` relationship change--it knows `bob.manager` changed, hence `bob.managersRecursive` changed, hence anyone "watching `bob.managersRecursive`" which requires "looking _down_ instead of _up_" needs to be told about the change.  

All of this is achieved by our `managersClosure` declaration:

```ts
readonly managersClosure: ReactiveManyToMany<Employee, Employee> =
  hasReactiveManyToMany(
    "managersRecursive",
    (e) => [e, ...e.managersRecursive.get],
  );
```

When the `jan.manager = jill` and `bob.manager = jan` graph mutation happens, Joist does roughly:

1. Setting `jan.manager = jill` triggers reactivity on "who is watching this write?"
   * We see `managersClosure` is watching `jan.managersRecursive`, and "reverse the hint" to find employee's _below_ Jan that need to know about this change
   * This queues `[jan, bob, fred]` to have their `managersClosure` recalc-d
2. Setting `bob.manager = jan` also triggers "who is watching this write?"
   * We again see `managersClosure` is watching `bob.managersRecusive`, and "reverse the hint" to find employee's _below_ Bob
   * The queues `[bob, fred]` to have their `manangersClosure` recalc-d
     * ...technically this is a noop b/c they're already queued
3. We recalc the `[jan, bob, fred].managersClosure` relations all at once
   * Joist resolves the `managersRecursive` reactive hint for all three entities
     * If any relations are already loaded, we use the in-memory results
     * If any relations are not loaded, we issue a single batched CTE query for their data
   * When the batched SQL resolves, the `managersClosure` lambda is invoked for each of `[jan, bob, fred]`
   * This sets `jan.manangersClosure = [jan, jill]`
   * And sets `bob.manangersClosure = [bob, jan, jill]`
   * And sets `fred.manangersClosure = [fred, bob, jan, jill]`
4. We call `em.flush()`
   * The three mutated `managerClosures` m2m collections are diffed
   * We issue a single `INSERT INTO managers_closures` with the new rows

This is admittedly a lot 😵, but thankfully it's all driven by Joist's internal infra keeping the `hasReactiveManyToMany` m2m up-to-date, by respecting the `managersRecusive` reactive hint we declared in the code.

And the key outcome is that the closure table was _completely updated for all affected employees_, and **we only issued 3 SQL calls**, 2 reads and 1 write:

* A single "down the tree" `SELECT` to find the employees to recalc
* A single "up the tree" `SELECT` to load the data for each lambda
* A single `INSERT` the new m2m rows. 

And because each of these operations is fundamentally batched, it will be the same 3 SQL calls _if we're changing 1 employee/manager relation or 100 employee/manager relationships_. 🤯 

A pretty amazing result for a 1-liner--can you imagine trying to achieve this with an adhoc, hand-coded implementation? It's not something I would readily sign up for. 😬

:::tip[Absolute Minimum Queries]

As a disclaimer, our approach does issue two reads / `SELECT`s before knowing the `INSERT` to update.

Most of the traditional, SQL-oriented posts like [the one we linked above](https://www.percona.com/blog/moving-subtrees-in-closure-table/) have examples of "jumping to the `INSERT`s / `DELETE`s writes", without any initial `SELECT`s, by sussing out the algorithm (i.e. non-trivial `WHERE` clauses) for keeping the m2m/closure table rows in sync across mutations.

This "jump to writes" approach avoids our two up-front `SELECT`s, so we must concede that Joist's approach is not "the absolute minimum number of queries", and we do pay the cost of pulling all `employees` in the path into memory.

If you have extremely deep (1000+ level?) trees, this next level of optimization could be worth it, albeit it would come with the increased complexity.

Our assertion is that Joist's performance of "3 fixed queries" will pragmattically be more performant than all but the most hand-optimized implementations, and it's low-cost/simplicity means the ROI often wins over a custom approach.

:::

## Closing Thoughts

That is our deep-dive of how two Joist primitives, recursive CTE support & reactive m2m relations, can combine to drive a really powerful result--closure tables implemented as a 1-liner.

The neatest aspect, to us, is that when we started our internal RBAC auth system, we did not need to "build closure tables as a new feature of Joist"--instead the solution emerged elegantly as just a combination of our existing features.

To be clear, we're not expecting readers to rush out and implement closure tables in their application--it is still a niche pattern, and, as we've seen, Postgres's recursive CTEs provide a great modern alternative (which Joist's recursive relations also put at your fingertips).

Instead our purpose is illustrating the power of Joist's "declarative business logic" and "reactive calculations", and encouraging readers to think about how these features could make their lives easier in their own work.
