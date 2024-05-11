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

I've been working on the Joist docs lately, specifically a "Why Joist?" page, which ended up focusing more on "why domain models?" than a feature-by-feature description of Joist.

Which is fine, but a friend (and early Joist user) challenged me, that I was being too humble, and I should be more assertive about Joist being "THE BEST ORM FOR TYPESCRIPT AND POSTGRES" (his words), as he listed off his own personal highlights:

1. If it compiles, it works.
2. It's "really effing fast" (no N+1s, ever).
3. We solve many common problems for you (insertion order of entities, auto-batching all updates, patterns for enums, polymorphic relations, etc.)
4. Factories make tests wonderful.

All of these are true.

But in thinking about his challenge, of pitching Joist specifically as "the best ORM for TypeScript & Postgres", I actually think I can be even more bullish and assert Joist is, currently, **the best ORM, in any language, ever, TypeScript or otherwise**.

Which is crazy, right? How could I assert this?

For two reasons, neither of which are technically unique to Joist, but both foundational to its design and implementation:

1. JavaScript's ability to solve N+1s via the event loop, and
2. TypeScript's ability to model loaded-ness in its type system.

## JavaScript's Event Loop

I've used many ORMs over the years, going back to Java's Hibernate, Ruby's ActiveRecord, and a few bespoke ones in between.

Invariably, they all suffer from N+1s.

I don't want to repeat Joist's existing [Avoiding N+1s](/docs/goals/avoiding-n-plus-1s) docs too much, but basically "entities are objects with fields/methods that incrementally lazy-load their relations from the database" is almost "too ergonomic", and tempts programmers into using the abstraction when they shouldn't (i.e. in a loop), at which point N+1s are inevitable.

Again as described in "Avoiding N+1s", JavaScript's event loop forcing all I/O calls to wait "just a sec", until the end of the event loop tick, gives Joist an amazing opportunity, shout out to [dataloader](https://github.com/graphql/dataloader), to de-dupe all the N+1s into a single SQL call.

This works so well, that personally **I don't know that I ever want to work in any language/stack that cannot use this trick**.

Granted, JavaScript does not have a lock on this feature--async Rust is a thing, and even [Vert.x](https://vertx.io/) on the JVM would allow the same (I briefly prototyped a "JVM-based dataloader for Vert.x" several years ago), and be pretty tempting just in terms of "faster than JavaScript" performance.

But the event loop is only half the story--the other half is TypeScript's type system.

## TypeScript's Type System

After solving N+1s with the event loop, the next biggest ergonomic problem is tracking loaded-ness in the type system.

Because you can't have your entire relational database in memory, domain models must incrementally load their data from the database, as your business logic's code paths decide which parts they need to read.

This was another downfall of the Hibernate/ActiveRecord ORMs: there was no notion of "is this relation loaded yet?", and so any random relation access could trigger the surprise of an expensive database I/O call, as that relation was lazy-loaded from the database.

Joist solves this by typing all relations "unloaded" by default, i.e. accessing an Author's books requires calling `a1.books.load()`, which returns a `Promise` (which is also key to the N+1 prevention above).

Which is great, I/O calls are now obvious, but "do an `await` for every relation access" would really suck, so Joist uses TypeScript's type system to track loaded-ness, and mark populated/loaded relations as `.get`-able:

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
* Mapped types that allow __synchronous__ `.get` access to statically-known-to-the-compiler loaded relations

Is, again for me, something **I never want to work without again**. It's just so nice.

Unlike JavaScript not having a monopoly on the event loop, for these mapped types I believe TypeScript basically has a lock on this capability, from a language type system perspective.

Creating "new types" like this is, in other languages, generally handled by macros (Scala and Rust), or I suppose Haskell's higher-kinded-types, but as far as I know, known of them can do this "take my user-defined type (Author)" and "this user-defined type literal populate hint" and fuse them together into a new type, that is "the author with this specific subgraph of fields marked as loaded". 

I'd love to be corrected on this, but I think it's pretty safe to assert that TypeScript is the only mainstream programming language that makes these mapped types very ergonomic.

## Conclusion

So, those two features are what back up my "best ORM ever?" assertion.

If tomorrow, I suddenly could not use Joist, and had to find an ORM to use, in any current/mainstream programming language, without a doubt I would want:

1. Bullet-proof N+1 prevention,
2. Tracking loaded state in the type system 
3. Populate hints to mark subgraphs as synchronously accessible, and
4. Reactivity, for cross-entity validation rules and reactive fields

Not only does no other ORM support those features, again in any language, but I don't think I could build own without having JavaScript's event loop and TypeScript's type system. They're just too good for this problem.



