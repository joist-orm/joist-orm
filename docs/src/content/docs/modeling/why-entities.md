---
title: Why Entities?
description: Documentation for Why Entities?
sidebar:
  order: 1
---

One of Joist's biggest differentiators is its focus on **entities** and **domain modeling**.

## Tldr: Structure

The tldr of "Why Entities?" is that they provide a structure for your application's business logic, which means:

- Derived fields you re-calculate when they're dirty,
- Validation rules you enforce before saving, and
- Side effects you trigger after saving

These are fundamental aspects to all backends, regardless of whether your ORM uses POJOs, or entities, or raw SQL queries.

Joist uses entities because, in our opinion, they provide very natural, intuitive guidance on **where to put business logic**, that otherwise in "raw POJO from the database" ORMs (query builders), each application must create its own structure in an adhoc/haphazard way.

:::tip[Tip]

Riffing on [Greenspun's Tenth Rule](https://en.wikipedia.org/wiki/Greenspun%27s_tenth_rule), Joist's "Tenth Rule" is that any sufficiently complicated query-builder-based CRUD app contains an ad hoc, informally-specified, bug-ridden, slow implementation of half of Joist's reactive domain model. :-)

:::

## Longer Answer

Most modern ORMs in the JavaScript/TypeScript space focus on being "query builders", where each invocation in your code (a call into Prisma or Drizzle or Kysley) results in generally one invocation to your database, and you get back every database row as a dumb (meant in a good way) [POJO](https://gist.github.com/kurtmilam/a1179741777ea6f88374286a640829cc)--no more, and no less.

And that is basically it--the organization of your business logic, application of validation rules, and side effects/reactivity (i.e. when row X updates, do Y) are outside their scope.

This can be good and bad: good in that they're simpler, more "like a library", but also bad in that now **your app has to have its own conventions** for organizing business logic, consistently applying validation rules, and managing side effects.

Joist is different: its focus is not just queries, but building [domain models](https://martinfowler.com/eaaCatalog/domainModel.html), with features, conventions, and patterns for organizing the business logic that application backends are generally expected to implement.

In this regard, Joist sits more on the "framework" side of the "library / framework" spectrum, although it can used for any backend, i.e. GraphQL or GRPC or old-school REST endpoints, so does not qualify as a true end-to-end framework like Rails.

:::tip[Info]

Ironically, query-builder ORMs like Drizzle tout their "we're *not* a data framework" approach as a benefit, just as much as Joist touts its "we *are* a framework" approach as a benefit. :-)

So whether you want a Joist-style "framework/entity ORM", or Drizzle-style "library/query-builder ORM", is a matter of personal taste and project requirements.

Some of it comes down to trust: do you trust yourself to remember to apply validation rules & side effects consistently, in every endpoint, before you issue low-level SQL calls via Drizzle/Prisma/Kysley, or do you trust Joist's entities & abstractions to do that automatically for you, without becoming too magical & spooky-action-at-a-distance?

Joist tries very hard to avoid the "too magical" pitfall, and make its behavior as unsurprising and idiomatic as possible (i.e. no N+1s, no complex queries), such that you quickly become to trust that `em.flush`, `em.find`, all "just do the right thing", and you can focus on providing business value.

So far, we believe we've succeeded, but again personal preference & project requirements plays a big role here.

:::

:::tip[Tip]

Although not a true  "end-to-end framework" like Rails, Joist grew out of a GraphQL backend and so has several ergonomic features for that use-case, like evergreen schema & resolver scaffolding.

(todo: write this up and link to it)

:::

### Examples for Reads

An example of Joist's "rich domain model" features is derived properties, which are calculations on top of your raw database values. For example a `hasManyThrough` or `hasAsyncProperty`:

```typescript
class Author extends AuthorCodegen {
  readonly reviews: Collection<Author, BookReview> = hasMany((a) => a.books.reviews);
  readonly totalRatings: AsyncProperty<Author, number> = hasAsyncProperty(
    { books: "reviews" },
    (a) => a.reviews.get.reduce((acc, r) => acc + r.rating, 0)
  );
}
```

Both of these are "utility methods" that can be reused across endpoints/logic in your app--Joist's domain model gives you a known/obvious place to put them, and also guarantees they can be calculated relatively cheaply (i.e. [without N+1s](/goals/avoiding-n-plus-1s)) or easily materialized (i.e. [reactive fields](/modeling/reactive-fields)).

The biggest win is that our business logic within these methods is written in **regular, ergonomic** TypeScript.

This contrasts with query-builder ORMs (and also "database-to-API" approaches like Hasura and PostGraphile), that focus solely on pulling data directly from the database, such that logic reuse must be pushed down into the database itself, and written as views, triggers, or stored procedures.

:::tip[Info]

When looking at the `totalRatings` example above, it can initially look weird to see the "this is just a `SUM(rating)`" logic in written in TypeScript, instead of being pushed down into the database as SQL, but the two key benefits are:

1. Once your business logic is more complex than a `SUM`, it can be much easier to express in TypeScript than SQL, and
2. Because the business logic is evaluated against in-memory entities, it can be called on not-yet-committed data, i.e. your pending in-memory changes (to a `Book` or `Author`) during a `save` operation, by validation rules or other business logic & they're guaranteed to see the latest calculated values.

   This is much easier than manually opening a transaction, flushing the WIP changes without commiting, then issuing queries to read the latest aggregates, do validation checks against those SQL-calculated aggregates, and then finally commit.

   (Although if you really do need this functionality, Joist's [Reactive Query Fields](/modeling/reactive-fields#reactive-query-fields) will orchestrate exactly this `begin` + `flush` + `query` + `flush` + `commit` sequence for you, automatically, within an `em.flush()` call).

That said, you can still do SQL-side `SUM`s and aggregates via custom SQL queries; that logic will just not be accessible to the rest of the Joist domain model.

:::


### Examples for Writes

On the write side, Joist's domain model approach also provides simple/obvious places to be validation rules and side effects.

An example validation rule might be "the author first name and book title can never be the same string"; obviously this is contrived, but it shows a rule that needs to "watch" multiple entities:

```typescript
import { authorConfig as config } from "./entities";

class Author extends AuthorCodegen {}

config.addRule({ firstName: {}, books: "title" }, (a) => {
  for (const book of a.books.get) {
    if (a.firstName === book.title) {
      throw new Error("Author first name and book title cannot be the same");
     }
  }
});
```

Assuming writes go through Joist's domain model, **any update** to `Author.firstName` or **any update** to a `Book.title` or **any `Book` switching authors** will fire this validation rule.

This "[backend reactivity](/modeling/validation-rules#reactive-validation-rules)" provides **extreme confidence** that your business rules will be enforced.

This again contrasts with query builder ORMs, where it's your job to manually remember which validation rules, both on the current entity and other entities that might be affected, need to be checked, before issuing an `INSERT` or `UPDATE`.

Instead, domain-focused validation logic that would normally be scattered across endpoints (like `saveAuthor`, `createBook` and `updateBook`), and coupled/intermingled with each endpoint's core job of decoding/mapping the incoming payload, is put in an idiomatic location where it will always get invoked.

## Thinking in Graphs

Beyond the reads & writes example, Joist fundamentally lets you "think in graphs" instead of "think in rows & columns".

:::tip[Info]

This section needs flushed out more.

:::

## Why Classes?

Joist's entities are classes, which often invokes a knee-jerk "anti-OOP" reaction.

However, we primarily use the `class Author extends AuthorCodegen` pattern to "inject" code-generated getters & setters into entities, as the most ergonomic workflow we've found so far.

The intent of Joist's entities is not to "encapsulate behavior" or "hide state" in traditional OOP sense--their job is precisely to expose state to clients/business logic.

Additionally, we think "exposing _abstracted_ state", i.e. helper methods that calculate cross-entity derived fields, is also a perfectly fine idea--TypeScript classes are a natural place for this logic to live, as the logic is effectively "overlaid on top" of the raw POJO coming back from the database.

## Why Mutability?

The other potentially controversial aspect of Joist's entities is that they are mutable.

This is because Joist's entities are meant to be "live" objects, that can be updated in memory, and then saved back to the database.

While can seem concerning, it's driven by following rationale, that you're either:

1. In a query/read endpoint, and the entities will be effectively immutable,
2. In a mutation/save endpoint, and the point is to mutate entities anyway, and
3. For either read/save endpoints, it's very likely you'll want to reuse logic across both the "read path" and "write path", so have strictly separate "read types" and "write types" will be more cumbersome than helpful.

Furthermore, Joist's `em.flush` method is actually very strict, such that:

- Initially, pre-`em.flush`, we want to allow easily the "morphing" the entities the graph's desired state,

  (I.e. "morphing" is more than just a single column change on one isolated row--you might be creating several new child entities (attached to a parent), deleting others, and even mutating the parent itself, in one save endpoint, that all needs to be atomically committed.)
- But once `em.flush` is called, and it's ran any hooks, all entities are **strictly locked** and become **effectively immutable**,
- And then `em.flush` runs validation rules against the now-immutable entities.

In our opinion, this gives you the best of both worlds:

* We guarantee that entities will be **immutable while being validated**, but
* Before then, you can very ergonomically mutate your graph to the desired state.

## Target Market

Joist will work great for any (Postgres) database schema or (TypeScript) team, large or small. We take a lot of inspiration from [ActiveRecord](https://guides.rubyonrails.org/active_record_basics.html), which of course has been used by many, many applications & teams of all sizes.

That said, Joist is particularly suited to **moderately-to-very complicated business domains**; i.e. stereotypical enterprise back-office systems are an ideal fit for Joist.

Joist's framework-style structure, and idiomatic ways of encoding cross-entity business invariants (reactive validation rules, reactive fields, and lifecycle hooks), are all purposefully built to manage the complexity of medium-to-large database schemas/domain models, where "just updating a few columns in this one database row" is insufficient.

