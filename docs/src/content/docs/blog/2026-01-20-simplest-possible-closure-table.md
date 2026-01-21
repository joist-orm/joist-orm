---
title: Simplest Possible Implementation of Closure Tables
slug: blog/simplest-possible-closure-tables
date: 2026-01-20
authors: shaberman
tags: []
excerpt: Joist-driven implementation of closure tables as an example of our declarative business logic.
---

Joist is a TypeScript ORM focused on declaratively implementing your business logic, and in this post we explore this snippet of code:

```ts
class Employee {
  /** Create a manager -> all transitive reports closure table. */
  readonly reportsClosure: ReactiveManyToMany<Employee, Employee> = hasReactiveManyToMany(
    "reportsRecursive",
    (e) => [e, ...e.reportsRecursive.get],
  );
}
```

Which we assert is the simplest possible implementation of closure tables (we'll explain closure tables in the post).

## Declarative Business Logic

But declarative business logic, if you have a derived field like `Author.fullName`, instead of the jQuery-esque imperative code of "every time you update `firstName`, remember to also update `fullName`":

```ts
async function updateAuthor(input: AuthorInput): void {
  await db
    .update(authors)
    .set({ firstName: "Jane" }) // forgot to update fullName
    .where(eq(authors.id, 1));
}
```

In Joist, you use declaratively define `fullName` as a function of two fields:

```ts
// In your domain model
class Author {
  readonly fullName = hasReactiveField(["firstName", "lastName"], (a) => {
    return `${a.firstName} ${a.lastName}`);
  }
}

// In your endpoints
async function updateAuthor(em: EntityManager, input: AuthorInput): void {
  const a = await em.load(Author, input.id);
  a.firstName = input.firstName;
  await em.flush(); // Joist will realize fullName needs recalced
}
```

And now anytime `firstName` or `lastName` is updated, `fullName` will be updated automatically.

(Yes, [generated columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html) are great for this on the pure-database side of things, but their expressions are limited to combining columns from the same table--Joist's reactive fields can reach across the object graph to implement your arbitrarily-complex business logic in JavaScript/TypeScript.)

## Closure Tables

How does this relate to closure tables? And what even are closure tables?

Closure tables are a way to store hierarchical data (trees) in a relational database that makes it easy to query "up & down the tree" with dumb/regular/fast joins.

For example, if we have `employees` table with a `employees.manager_id` column, the manager & their reports & their reports's reports & etc form a tree of "all transitive reports of this employee/manager".

Historically, the "fixed" nature of SQL queries (i.e. no `for` loops) made it hard to write queries like "find the manager and all their transitive reports", given the "sometimes one, sometimes two, sometimes `N` levels of employees" schema.

...at least until `WITH RECURSIVE` CTEs came along:

```sql
WITH RECURSIVE employee_tree AS (
    -- Base case: start with the manager
    SELECT  id, name, manager_id, 1 AS depth FROM employees WHERE id = :manager_id
    UNION ALL
    -- Recursive case: find all direct reports of current level
    SELECT e.id, e.name, e.manager_id, et.depth + 1 FROM employees e
    INNER JOIN employee_tree et ON e.manager_id = et.id
)
SELECT * FROM employee_tree;
```

Which is really great, but sometimes we still want the performance/ease of queries with "dumb joins".

Closure tables faciliate this by adding _an additional table_ that materializes the relational between the manager and their reports, by purposefully "over-creating" joins from the manager across "each hop" down the tree.

...example of that...

This makes queries for "find the manager and all their transitive reports" easy:

```sql
SELECT * FROM employees ee
  JOIN employee_closure ec on ee.id = ec.employee_id
  WHERE ec.manager_id = :manager_id;
```

There are pros and cons to this approach:

- Pro: Closure tables can be more performant than recursive CTEs, especially for large datasets
- Con: We duplicate data across the closure table, increasing storage requirements
- Con: Maintaining the closure table by hand, as manager/employee reationships change, can be particular tricky

This last con is where Joist can step in.

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
