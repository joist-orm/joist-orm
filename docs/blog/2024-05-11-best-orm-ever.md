---
title: The Best ORM, Ever?
description: A thought experiment on whether Joist is the best ORM ever.
slug: the-best-orm
authors:
  - name: Stephen Haberman
    url: https://github.com/stephenh
    image_url: https://github.com/stephenh.png
tags: []
---

I've been working on the Joist docs lately, specifically a "Why Joist?" page, which ended up focusing more on "why Domain Models?" than a feature-by-feature description of Joist.

Which is fine, but a good friend (and early Joist user) proof-read the docs, and afterwards challenged me, that I was being too humble, and I should be more assertive about Joist being "THE BEST ORM FOR TYPESCRIPT AND POSTGRES" (his words), as he listed off his own personal highlights:

1. If it compiles, it works. "If you love TypeScript, you'll love Joist."
2. It's "really effing fast" ([no N+1s](/docs/goals/avoiding-n-plus-1s), ever).
3. We solve many common problems for you ([auto-batching all updates](/docs/features/entity-manager#auto-batch-updates), insertion ordering of entities, and have many patterns for [enums](/docs/modeling/enum-tables), [polymorphic relations](/docs/modeling/relations#polymorphic-references), etc.)
4. [Factories](/docs/testing/test-factories) make testing amazing.

All of these are true.

But in thinking about his challenge, of pitching Joist specifically as "the best ORM for TypeScript & Postgres", I actually think I can be even more bullish and assert Joist is, currently, **the best ORM, in any language, ever, TypeScript or otherwise**.

Which is crazy, right? How could I possibly assert this?

I have three reasons; admittedly the first two are not technically unique to Joist, but both foundational to its design and implementation, and the third that is one of Joist's "special sauces":

1. JavaScript's ability to solve N+1s via the event loop, and
2. TypeScript's ability to model loaded-ness in its type system.
3. Backend reactivity

## No N+1s: JavaScript's Event Loop

I've used many ORMs over the years, going back to Java's Hibernate, Ruby's ActiveRecord, and a few bespoke ones in between.

Invariably, they all suffer from N+1s.

I don't want to repeat Joist's existing [Avoiding N+1s](/docs/goals/avoiding-n-plus-1s) docs, but basically "entities are objects with fields/methods that incrementally lazy-load their relations from the database" is almost "too ergonomic", and tempts programmers into using the abstraction when they shouldn't (i.e. in a loop), at which point N+1s are inevitable.

Again as described in "Avoiding N+1s", JavaScript's event loop forcing all I/O calls to wait "just a sec", until the end of the event loop tick, and gives Joist an amazing opportunity, of course via [dataloader](https://github.com/graphql/dataloader), to de-dupe all the N+1s into a single SQL call.

For everything.

This works so well, that personally **I don't know that I ever want to work in a programming language/tech stack that cannot use this trick** (at least to build backend / line-of-business applications).

Granted, JavaScript is not the only language with an event loop--async Rust is a thing, Python has asyncio, and even [Vert.x](https://vertx.io/) on the JVM could facilitate it (I prototyped "dataloader ported to Vert.x" several years ago), and either Rust or the JVM (Scala!) would be pretty tempting just in terms of "faster than JavaScript" performance.

But the event loop is only part of the story--another critical part is TypeScript's type system.

## Loaded Subgraphs: TypeScript's Type System

After solving N+1s with the event loop, the next biggest ergonomic problem in traditional, entity-based ORMs is tracking loaded-ness in the type system.

Because you can't have your entire relational database in memory, domain models must incrementally load their data from the database, as your business logic's code paths decide which parts they need to read.

This was another downfall of the Hibernate/ActiveRecord ORMs: there was no notion of "is this relation loaded yet?", and so any random relation access could trigger the surprise of an expensive database I/O call, as that relation was lazy-loaded from the database.

Joist solves this by [statically typing all relations](/docs/goals/load-safe-relations) as "unloaded" by default, i.e. accessing an Author's books requires calling `a1.books.load()`, which returns a `Promise` (which is also key to the N+1 prevention above).

Which is great, I/O calls are now obvious, but "do an `await` for every relation access" would really suck (we tried that for awhile), so Joist uses TypeScript's type system to not only track loaded-ness, but mark **entire subgraphs** of entities as populated/loaded relations and synchronously accessible:

```ts
// Load the Author plus the specific books + reviews subgrpah
const a1 = await em.load(Author, "a:1", {
  populate: { books: { reviews: "comments" } },
});

// a1 is typed as Loaded<Author, { books: { reviews: "comments" } }>
// Tada, no more await Promise.all
a1.books.get.forEach((book) => {
  book.reviews.get.forEach((review) => {
    console.log(review.comments.get.length);
  });
})
```

This combination of:

* Explicit `.load()` / `await` calls for any I/O, but
* Mapped types that allow compiler-checked __synchronous__ access

Is, for me, also something that **I never want to work without again**. It's just so nice.

Unlike JavaScript not having a monopoly on the event loop, for these mapped types I believe TypeScript effectively does have a lock on this capability, from a language type system perspective.

Creating "new types" like this is, in other languages, generally handled by macros (Scala and Rust), or I suppose Haskell's higher-kinded-types, but as far as I know, none of them can combine TypeScript "mapped + conditional" types in a way that would allow this "take my user-defined type (Author)" and "this user-defined populate hint type" and fuse them together into a new type, that is "the author with this specific subgraph of fields marked as loaded". 

I'm happy to be corrected on this, but I think TypeScript is the only mainstream programming language that can do this.

Granted, other TypeScript ORMs (Prisma, Drizzle, etc.) also leverage TypeScript's mapped types to create dynamic shapes of data, which is legitimately great, but they are also typically "one-shot" queries that return immutable data, and not subgraphs of entities that can be further incrementally loaded as/if needed (see [Why Joist](/docs/why-joist) for more), and I just personally prefer "entity" / "data framework" based ORMs.

## Joist's Backend Reactivity

This is the 1st feature that is unique to Joist itself, and not just an approach enabled by the "JavaScript/TypeScript" platform.

Many ORMs have life cycle hooks, but Joist's [reactive fields](/docs/modeling/reactive-fields) and [reactive validation rules](/docs/modeling/validation-rules) are, compared to ORMs I've used in the past, a big step forward in their precision and ergonomics, because of their ability to work "on subgraphs" instead of just immediate fields on an entity.

## Conclusion

So, those three features are what back up my "best ORM ever?" assertion.

If tomorrow, I suddenly could not use Joist, and had to find another ORM to use (or, in general, build any sort of backend on top of a relational database), in any current/mainstream programming language, without a doubt I would want:

1. Bullet-proof N+1 prevention,
2. Tracking loaded relation/subgraph state in the type system
3. Backend reactivity, for cross-entity validation rules and reactive fields

And Joist is the only ORM that does all three of these: two of which are uniquely enabled by the JavaScript/TypeScript stack, and the third just part of Joist's own innovation.

## Disclaimer

Usually I don't like making bold/absolutist claims, like "this or that framework is 'the best'" or "technology x/y/z is terrible" or what not; I did enough of that early in my career, and at this point I'm more interested in "what are the trade-offs?" and "what's the best tool for this specific use case?"

So, I hold two somewhat incongruent thoughts in my head, as I am both:

- Very bullish on Joist being the best/most idiomatic way to build an application backend on top of Postgres (and someday other relational databases), but I also
- Recognize it's "framework" / entity approach (see [Why Joist](/docs/why-joist)) might be either too opinionated or too much abstraction for some people's tastes.

My guess is that if you tried Joist, you would quickly come to like it, but it's also perfectly fine if not!

Thanks for the read!

