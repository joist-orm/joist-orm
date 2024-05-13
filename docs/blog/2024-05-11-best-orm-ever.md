---
title: The Best ORM, Ever?
description: A thought experiment on whether Joist is the best ORM ever.
slug: the-best-orm-ever
authors:
  - name: Stephen Haberman
    url: https://github.com/stephenh
    image_url: https://github.com/stephenh.png
tags: []
---

I've been working on the Joist docs lately, specifically a [Why Joist?](/docs/why-joist) page, which ended up focusing more on "why Domain Models?" than a feature-by-feature description of Joist.

Which is fine, but a good friend (and early Joist user) proofread it, and afterward challenged me that I was being too humble, and I should be more assertive about Joist being "THE BEST ORM FOR TYPESCRIPT AND POSTGRES" (his words), as he listed off his own personal highlights:

1. If it compiles, it works. "If you love TypeScript, you'll love Joist."
2. It's "really effing fast" ([no N+1s](/docs/goals/avoiding-n-plus-1s), ever).
3. We solve many common problems for you ([auto-batching updates](/docs/features/entity-manager#auto-batch-updates), handling the insertion order of related entities, and have many patterns for [enums](/docs/modeling/enum-tables), [polymorphic relations](/docs/modeling/relations#polymorphic-references), etc.)
4. [Factories](/docs/testing/test-factories) make testing amazing.

All of these are true.

But in thinking about his challenge, of pitching Joist specifically as "the best ORM for TypeScript & Postgres", I actually think I can be even more bullish and assert Joist is, currently, **the best ORM, in any language, ever, TypeScript or otherwise**.

Which is crazy, right? How could I possibly assert this?

I have three reasons; admittedly the first two are not technically unique to Joist, but both foundational to its design and implementation, and the third that is one of Joist's "special sauces":

1. JavaScript's ability to solve N+1s via the event loop, and
2. TypeScript's ability to model loaded-ness in its type system.
3. Joist's "backend reactivity"

## No N+1s: JavaScript's Event Loop

I've used many ORMs over the years, going back to Java's Hibernate, Ruby's ActiveRecord, and a few bespoke ones in between.

Invariably, they all suffer from N+1s.

I don't want to repeat Joist's existing [Avoiding N+1s](/docs/goals/avoiding-n-plus-1s) docs, but basically "entities are objects with fields/methods that incrementally lazy-load their relations from the database" is almost "too ergonomic", and tempts programmers into using the abstraction when they shouldn't (i.e. in a loop), at which point N+1s are inevitable.

Again as described in "Avoiding N+1s", JavaScript's event loop forcing all I/O calls to "wait just a sec", until the end of the event loop tick, gives Joist an amazing opportunity, of course via [dataloader](https://github.com/graphql/dataloader), to de-dupe all the N+1s into a single SQL call.

For everything.

This works so well, that personally **I don't know that I ever want to work in a programming language/tech stack that cannot use this trick** (at least to build backend/line-of-business applications).

Granted, JavaScript is not the only language with an event loop--async Rust is a thing, Python has asyncio, and even [Vert.x](https://vertx.io/) on the JVM provides it (I prototyped "dataloader ported to Vert.x" several years ago), and either Rust or the JVM (Scala!) would be pretty tempting just in terms of "faster than JavaScript" performance.

But the event loop is only part of the story--another critical part is TypeScript's type system.

:::info

Other TypeScript ORMs like Prisma & Drizzle "solve" N+1s by just not modeling your domain as entities (with lazy-loaded relations), and instead force/assume a single/large up-front query that returns an immutable tree of POJOs.

This does remove the most obvious N+1 footgun (lazy-loaded relations), but it also fundamentally restricts your ability to decompose business logic into smaller/reusable methods, because now any logic that touches the database must be done "in bulk" directly by your code, and often crafted in SQL specifically to how each individual endpoint is accessing the data.

(Concretely, if you had a `saveAuthor` endpoint with logic/queries to validate "this author is valid", and now write a batch `saveAuthors` endpoint, you could not reuse the "written for one entity" logic without rewriting it to work at the new endpoint's grouped/batch level of granularity. Or similar for `saveBook` logic that you want to use within a `saveAuthor` that also upserts multiple children books.)

Instead, Joist's auto-batching lets you ergonomically write code at the individual entity abstraction level (whether in a loop, or in per-entity validation rules or lifecycle hooks), but still get performant-by-default batched queries.

:::

## Loaded Subgraphs: TypeScript's Type System

After solving N+1s with the event loop, the next biggest ergonomic problem in traditional, entity-based ORMs is tracking (or basically not tracking) loaded-ness in the type system.

Because you can't have your entire relational database in memory, domain models must incrementally load their data from the database, as your business logic's codepaths decide which parts they need to read.

This was another downfall of the Hibernate/ActiveRecord ORMs: there was no notion of "is this relation loaded yet?", and so any random relation access could trigger the surprise of an expensive database I/O call, as that relation was lazy-loaded from the database.

Joist solves this by [statically typing all relations](/docs/goals/load-safe-relations) as "unloaded" by default, i.e. accessing an Author's books requires calling `a1.books.load()`, which returns a `Promise` (which is also key to the N+1 prevention above).

Which is great, I/O calls are now obvious, but "do an `await` for every relation access" would really suck (we tried that), so Joist goes further and uses TypeScript's type system to not only track individual relation loaded-ness (like `author1.books` or `book2.authors`), but mark **entire subgraphs** of entities as populated/loaded relations and hence synchronously accessible:

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

* Explicit `.load()` / `await` calls for any I/O, but leveraging
* Mapped types to allow compiler-checked __synchronous__ access

For me, is also something that **I never want to work without again**. It's just so nice.

Unlike JavaScript not having a monopoly on the event loop, for these mapped types I believe TypeScript effectively does have a lock on this capability, from a programming language/type system perspective.

Creating "new types" in other programming languages is generally handled by macros (Scala and Rust), or I suppose Haskell's higher-kinded-types. But, as far as I know, none of them can combine TypeScript "mapped type + conditional type" features in a way that would allow this "take my user-defined type (Author)" and "this user-defined populate hint type" and fuse them together into a new type, that is "the author with this specific subgraph of fields marked as loaded". 

I'm happy to be corrected on this, but I think TypeScript is the only mainstream programming language that can really power Joist's `Loaded<Author, { books: "reviews" }>`-style adhoc typing of subgraphs, or at least this easily.

:::info

Other TypeScript ORMs (Prisma, Drizzle, Kysley, etc.) also leverage TypeScript's mapped types to create dynamic shapes of data, which is legitimately great.

However, they all have the fundamental approach of issuing "one-shot" queries that return immutable trees of POJOs, directly mapped from your SQL tables, and not subgraphs of entities that can have non-SQL abstractions & be further incrementally loaded as/if needed (see [Why Joist](/docs/why-joist) for more on this).

You can generally see, for both issues covered so far (N+1s and statically-typed loaded-ness), most TypeScript ORMs have "solved" these issues by just removing the features all together, and restricting themselves to be "sophisticated query builders".

Joist's innovation is keeping the entity-based, incremental-loading mental model that is historically very popular/idiomatic for ORMs (particularly Ruby's ActiveRecord), and just fundamentally fixing it to not suck.

:::

## Joist's Backend Reactivity

This 3rd section is the first feature that is unique to Joist itself: Joist's "backend reactivity".

Many ORMs have lifecycle hooks (this entity was created, updated, or deleted--which Joist [does as well](/docs/modeling/lifecycle-hooks)), to organize side effects/business logic of "when X changes, do Y".

But just lifecycle hooks by themselves can become tangled, complicated, and a well-known morass of complexity and "spooky action at a distance".

This is because they're basically "Web 1.0" imperative spaghetti code, where you have to manually instrument each mutation that might trigger a side effect.

(Concretely, lets say you have a rule that needs to look at both an author and its books. With raw lifecycle hooks, you must separately instrument both the "author update" and "book update" hooks to call your "make sure this author + books combination is still valid" logic. This can become tedious and error-prone, to get all the right hooks instrumented.)

Instead, Joist's [reactive fields](/docs/modeling/reactive-fields) and [reactive validation rules](/docs/modeling/validation-rules)  take the lessons of "declarative reactivity" from the Mobx/Solid/reactivity-aware frontend world, and bring it to the backend: reactive rules & fields declare in one place what their "upstream dependencies" are, and Joist just handles wiring up the necessary cross-entity reactivity.

This brings a level of ease, specificity, and rigor to what are still effectively lifecycle hooks under the hood, that really makes them pleasant to work with.

:::info

The declarative nature of Joist's domain model-wide reactivity graph is also very amenable to DX tooling & documentation generation, but we've not yet deeply explored/delivered any functionality that leverages it.

:::

## Conclusion: Best ORM Ever?

So, these three features are what back up my exaggerated "best ORM ever" assertion.

If tomorrow, I suddenly could not use Joist, and had to find another ORM to use (or, in general, build any sort of application backend on top of a relational database), in any current/mainstream programming language, without a doubt I would want:

1. Bullet-proof N+1 prevention,
2. Tracking loaded relation/subgraph state in the type system, and
3. Backend reactivity, for declarative cross-entity validation rules and reactive fields.

And Joist is the only ORM that does all three of these: two of which are uniquely enabled by the JavaScript/TypeScript stack, and the third just part of Joist's own innovation.

## Disclaimer 1: Uncomfortably Bold Claims

I usually don't like making bold/absolutist claims, like "this or that framework is 'the best'" or "technology x/y/z is terrible" or what not.

I did enough of that early in my career, and at this point I'm more interested in "what are the trade-offs?" and "what's the best tool for this specific use case?"

So, I hold two somewhat incongruent thoughts in my head, as I am both:

- Very confident that Joist is "the best" way to build application backends on top of a relational database, for a large majority of use cases/teams/codebases, but I also
- Recognize it's "framework" / entity approach (see [Why Joist](/docs/why-joist)) might be either too opinionated or too much abstraction for some people's tastes, and just in general choices & alternatives are always great to have.

My guess is if you tried Joist, you would quickly come to like it, but it's also perfectly fine if not!

## Disclaimer 2: Still a Lot To Do

Similar to the two incongruent thoughts above, another two semi-contradictory thoughts is the disclaimer that:

- Joist's core is very solid and vetted by 4+ years of production usage & continual iteration at [Homebound](https://www.homebound.com/), but also
- There's still a lot of work to do, obviously supporting other databases, but also the myriad fun, incremental improvement ideas we're tracking in the issue tracker, and of course even more that we've not thought of yet.

## Feedback

If you have thoughts, questions, or feedback, please let us know! Feel free to join the [Joist discord](https://discord.gg/ky9VTQugqu), or file issues on the GitHub repo if you try Joist and run into any issues.

Despite all the hubris in this post, we are still a very small project & community, and so have a lot of growth and improvement ahead of us.

Thanks for the read!

