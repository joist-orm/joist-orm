---
title: No Ugly Queries
sidebar_position: 5
---

Historically, ORMs have a reputation for creating "ugly queries". These queries can:

- Cause performance issues b/c of their arcane/weird output, or
- Cause bugs b/c the ORM query generates SQL that doesn't actually do what the programmer meant (leaky abstractions), or
- Just look weird in general.

And have caused a backlash of programmers who insist on writing every SQL query by hand. 

Joist asserts this is a **false dichotomy**; we shouldn't have to choose between:

* "Handwriting every line of SQL in our app", and
* "The ORM generates ugly queries"

How does Joist solve this? By not trying so hard.

## Use mostly Joist, with some custom

Joist "solves" ugly queries by just never even attempting them: it's a non-goal for Joist to own "every SQL query in your app".

Granted, we think Joist's graph navigation & `em.find` APIs are powerful, ergonomic, and should be **the large majority** of SQL queries in your app: "get this author's books", "load the books & reviews & their ratings", "load the Nth page of authors with the given filters", etc.

But for any queries that are truly custom, and generally doing "hard things", it's perfectly fine to use a separate, lower-level query builder, or even raw strings, to build out complicated queries.

These lower-level APIs put you in full-control of the SQL, at the cost of more verbosity and complexity--but sometimes that is the right tradeoff.

:::tip

In one production Joist codebase, approximately 95% of the SQL queries were Joist-created graph navigation & `em.find` queries, and 5% were handwritten custom Knex queries.

This ratio will vary between codebases, but we feel confident it will be over 80%, and that the succinctness of using Joist for these 80-95% cases (with their guarantee to be "not ugly"), is a big productivity win.

:::

## What we don't support

Specifically, today Joist does not support:

* Common Table Expressions
* Group bys, aggregates, sums, havings
* Loading anything that isn't any entity
* Probably much more

Granted, we don't want to undersell our `em.find` API short--it is great, but nor have we set out to "build a DSL to create every SQL query ever".

That is just not Joist's strength--our strength is ergonomically representing complicated business domains, and enforcing compliated business constraints, and that is a hard enough problem as it is. :-) 

We encourage you to use "closer to the metal" libraries like Knex or Kysley, for your app's truly-custom query needs.

:::info

Obviously having multiple full-fledged libraries, i.e. Joist for the domain model and Kysley for low-level queries, is not a great solution, and probably overkill.

Personally, we use Knex for our low-level custom queries (those 5%), because it's lightweight and sufficiently ergonomic.

Joist will likely eventually provide a "raw SQL" query builder, but it will be a completely separate API from `em.find`, to avoid any slippery slopes to `em.find` becoming a leaky abstraction and creating "ugly queries".

:::
