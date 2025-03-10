---
title: No Ugly Queries
description: Documentation for No Ugly Queries
---

Historically, ORMs have a reputation for creating "ugly queries", particularly when the ORM's query API adds too much abstraction on top of raw SQL, and what "looks simple" in the query API is actually a big, gnarly SQL string that no programmer would ever write by hand.

These ugly queries can cause multiple issues:

- Performance issues b/c of their arcane output can't be optimized by the database,
- Logic issues (bugs) b/c the generated SQL that doesn't actually do what the programmer meant (leaky abstractions), and
- Just look weird in general.

And have caused a backlash of programmers who insist on writing every SQL query by hand. 

Joist asserts this is a **false dichotomy**; we shouldn't have to choose between:

* "Handwriting every line of SQL in our app", and
* "The ORM generates ugly queries"

How does Joist solve this? By not trying so hard.

## Use mostly Joist, with some custom

Joist "solves" ugly queries by just never even attempting them: it's a non-goal for Joist to own "every SQL query in your app".

Granted, we think Joist's graph navigation & `em.find` APIs are powerful, ergonomic, and should be **the large majority** of SQL queries in your app: "get this author's books", "load the books & reviews & their ratings", "load the Nth page of authors with the given filters", etc.

However, we've limited them to **only features that can be implemented with "obviously boring SQL"**.

Instead, for any of your queries that are truly custom, and doing "hard, complicated things", it's perfectly fine to use a separate, lower-level query builder, or even raw SQL strings, to issue complicated queries.

These lower-level APIs put you in full-control of the SQL, at the cost of more verbosity and complexity--but sometimes that is the right tradeoff!

:::tip[Tip]

In one production Joist codebase, approximately 95% of the SQL queries were Joist-created graph navigation & `em.find` queries, and 5% were handwritten custom Knex queries.

This ratio will vary between codebases, but we feel confident it will be over 80%, and that the succinctness of using Joist for these 80-95% cases (with their guarantee to be "not ugly"), is a big productivity win.

:::

## What we don't support

Specifically, today Joist does not support:

* Common Table Expressions
* Group bys, aggregates, sums, havings
* Loading/processing any query results that aren't entities
* Probably much more

Granted, we don't want to undersell our `em.find` API (it is great), but nor have we set out to "build a DSL to create every SQL query ever".

That is just not Joist's strength--our strength is ergonomically representing complicated business domains, and enforcing complicated business constraints, and that is a hard enough problem as it is. :-) 

Instead, we encourage you to use lower-level libraries like Knex for your app's custom queries.

:::tip[Info]

Obviously having multiple full-fledged libraries, i.e. Joist for the domain model and Kysley for low-level queries, is not a great solution, and probably overkill.

Personally, we use Knex for our low-level custom queries (those 5%), because it's lightweight and sufficiently ergonomic.

Joist may eventually provide a "raw SQL" query builder, that is Knex-ish, but it will be a completely separate API from `em.find`, to avoid any slippery slopes to `em.find` becoming a leaky abstraction and creating "ugly queries".

:::
