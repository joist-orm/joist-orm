---
title: Using CTEs and Query Rewriting to Solve Versioning
slug: blog/query-rewriing-versioning
date: 2025-10-06
authors: shaberman
tags: []
---

Joist is an ORM primarily developed for Homebound's GraphQL majestic monolith, and we recently shipped a long-awaited Joist feature, **SQL query rewriting via a plugin API**, to deliver a key component of our domain model: _aggregate root-level versioning_.

## Aggregate What Now?

What is Aggregate Root-Level Versioning? It's different from traditional database-wide, time-based versioning, like auditing solutions like [cyanaudit](https://pgxn.org/dist/cyanaudit/) or temporal `FOR SYSTEM_TIME AS OF` queries (we use cyanaudit for our audit trail & really like it!).

Let's back up and start with "aggregate root"--what is that? An aggregate is a cluster of ~2-10+ "related entities" in your domain model. The cluster of course depends on your specific domain--examples might be "an author & their books", or "a customer & their bank accounts & profile information".

Typically there is "an aggregate parent" (called the "aggregate root", since it sits at the root of the aggregate's subgraph) that naturally "owns" the related children within the aggregate; i.e. the `Author` aggregate root owns the `Book` and `BookReview` children; the `Customer` aggregate root owns the `CustomerBankAccount` and `CustomerProfile` entities.

:::tip

If you see a naming pattern of `Customer`, and then lots of `CustomerFoo`, `CustomerBar`, `CustomerZaz` entities, occuring in your domain model, where you're just naturally using the `Customer...` prefix to group entities together, that is a hint that `Customer` is the aggregate root for that cluster of entities.

:::

Historically, Aggregate Roots are a pattern from Domain Driven Design, and mostly theroetically useful--they serve as a logical grouping, which is nice, but don't always manifest as specific outcomes/details in the implementation (at least from what I've seen).

:::tip

Unless you are sharding! At which point the aggregate root's primary key, i.e. `Customer.id`, makes a really great shard key for all the child entities within the aggregate root.

:::

### Why Version An Aggregate?

Normally Joist blog posts don't focus on specific domains or verticals, but for the purposes of this post, it helps to know the problem we are solving.

At Homebound, we're a construction company that builds residential homes; our primary domain model supports the planning and execution of our procurement & construction ops field teams.

The domain model is large (currently 500+ tables), but two key components are:

* The archiectural plans for a specific model of home (called a `PlanPackage`), and
* The design scheme for products that go into a group of similar plans (called a `DesignPackage`)

Both of these `PlanPackage`s and `DesignPackage`s are aggregate roots that encompass many child entities within them:

- What rooms are in the plan? `PlanPackageRoom`s
- What materials & labor are required (bricks, lumber, quantities)? `PlanPackageScopeLine`s
- What options do we offer to customers? `PlanPackageOption`s
  - How do these options change the plan's materials & labor? A m2m between `PlanPackageScopeLine`s and `PlanPackageOption`s
- What are the appliances in the kitchen? `DesignPackageProduct`s
- What spec levels, of Essential/Premium/etc, do we offer? `DesignPackageOption`s 
  - How do these spec levels change the home's products? A m2m between `DesignPackageProduct`s and `DesignPackageOption`s

This web of interconnected data can all be modeled (albeit somewhat tediously)--but we also want it versioned!

Change management is extremely important in construction--what was v10 of the `PlanPackage` last week? What is v15 of the `PlanPackage` this week? What changed in each version between v10 and v15? Are there new options available to homebuyers? What scope changed? Do we need new bids? Etc.

And, pertitent to this blog post, we want each of the `PlanPackage`s and `DesignPackage`s respective "web of interconnected data" (the aggregate root & its children) _versioned together as a group_ with *application-level* versioning: multiple users collaborate on the data (making simulatenous edits across the `PlanPackage` or `DesignPackage`), co-creating the next draft, and then we "Publish" the next active version with a changelog of changes.

After users draft & publish the plans, and potentially start working on the next draft, our application needs to be able to load a  complete "aggregate-wide snapshot" for "The Cabin Plan" `PlanPackage v10` (that was maybe published yesterday) and a complete "aggregate-wide snapshot" of "Modern Design Scheme" `DesignPackage v8` (that was maybe published a few days earlier), and glue them together in a complete home.

Hopefully this gives you an idea of the problem--it's basically like users are all collaborating on "the next version of the plan document", but instead of it being a Google Doc that gets copy/pasted to create "v1" then "v2" then "v3", the collaborative/versioned artifact is our deep, rich domain model of construction data.

## Schema Approach

After a few _cough_ "prototypes" _cough_ of database schemas for versioning in the earlier days of our app, we settled on a database schema we like: two tables per entity, a main "identity" table, and a "versions" table to store snapshots, i.e. something like:

* `authors` table: stores the "current" author data (`first_name`, `last_name`, etc), with 1 row per author (we call this the "identity" table)
* `author_versions`  table: stores snapshots of the author over time (`author_id`, `first_name`, `last_name`), 1 row per *version* of each author (we call this the "version" table)

This is an extremely common approach for versioning schemas, i.e. it's effectively the same schema suggested by PostgreQL's [SQL2011Temporal](https://wiki.postgresql.org/wiki/SQL2011Temporal#System_Time) docs, albeit technically they're tracking system time, like an audit trail, and not our user-driven versioning.

This leads to a few differences; the `SQL2001Temporal` history tables use a `_system_time daterange` column to present "when each row was applicable in time" (tracking system time), while we use two FKs that also form a range, but the range is not time-based, it's version-based: "this row was applicable starting at `first=v5` until `final=v10`".

So example rows in our `author_versions` table would look like:

* `id=10 author_id=1 first_id=v10 final_id=v15 first_name=bob last_name=smith`
* `id=11 author_id=1 first_id=v15 final_id=v20 first_name=fred last_name=smith`
* `id=11 author_id=1 first_id=v20 final_id=null first_name=fred last_name=brown`

Means that:

* From versions `v10` to `v15`, the `author:1` had a `firstName=bob`
* From versions `v10` to `v20`, the `author:1` had a `firstName=fred`
* From versions `v20` to now, the `author:1` had a `lastName=brown`

We found this `_versions` table strikes a good balance of tradeoffs:

* If `v20` of the aggregate root (i.e. our `PlanPackage`) only changed the `Author`s and two of its `Book`s, there will only be 1 `author_versions` and two `book_versions`, even if the Author has 100s of books (i.e. we avoid making full copies of the aggregate root on every version)
* When a row does change, we just snapshot the entire row, instead of tracking only which specific columns changes (this takes more space, but makes historical/versioned queries much easier)

A big win is that we can reconstruct historical versions by only loading into memory the singular "effective version" for each entity, with queries like:

```SQL
select * from author_versions av
join authors a on av.author_id = a.id
where a.id in $1
  and av.first_id <= $2
  and (av.final_id is null or av.final_id < $3)
```

Where:

- `$1` is whatever authors we're looking for
- `$2` is the version of the aggregate root we're "as of", i.e. v10
- `$3` is the same aggregate of "as of", i.e. v10

The condition of `first <= v10 < final` finds the singular `author_version` that is "effective" or "active" in v10, even if the version itself was created in v5 (and either never replaced, or not replaced until "some version after v10" like v15).

### ...but what is "Current"?

From the previous section, the `authors` and `author_versions` schema is hopefully fairly obvious/intuitive, but I left out a wrinkle: what data is stored in the `authors` table itself?

Obviously it should be "the data for the author"...but which version of the author?

We considered two options:

1. The `authors` table stores the _latest published_ version, or
2. The `authors` table stores the _latest draft_ version

We sussed out pros/cons in a design doc:

* Option 1. Store the "latest published" data in `authors`
  * Pro 1.1: The safest b/c readers that "just read from `authors`" would not accidentally read draft/published data (a big concern at the time)
  * Pro 1.2: Any reader that wants to "read latest" doesn't have to know about versioning at all, and can just read the tables as-is (also a big win, b/c we had legacy code that wouldn't need updated to "not see the drafts")
  * Con 1.1: Writes that have business logic must first "reconstruct the draft author" (and its books and it book reviews) from the `_versions` tables
  * Con 1.2: Similarly, validation rules against changed authors/books/etc. must first "reconstruct the draft author" from the `_versions` tables to correctly check invariants
* Option 2. Store "latest draft" data in `authors`
  * Pro 2.1: Writes that have business logic can simply `em.load(Author)` & already get the latest draft data to operate again--this is "amazingly boring", stock Joist code
  * Con 2.1: All readers, even those that just want the published, must use the `_versions` table to "reconstruct the published author"

(By "reconstruct the [published or draft] author", what I mean is, after doing an `const author = await em.load(Author, 1)`, if you want "actually the draft version", your code constantly needs to "wait, look for a `author.draftVersion` and use that instead.)

After the usual design doc review, group comments, etc., we decide to __store latest published in `authors`__, with the key decisions being:

- Con 2.1 -- we really did not want to have instrument all our readers to know about `_versions` tables
- And we thought Con 1.3 would "not be a big deal"

(You can tell I'm foreshadowing this was maybe not the best choice.)

### Initial Approach: Write to Drafts

So, with our versioning scheme in place, we set off on a large project to implement one of our first big, non-trivial features that needed to use versioning--allowing home buyers to heavily personalized the products/choices we offer in the `DesignPackage` aggregate root.

And it was a disaster. 

This feature set was legitimately complicated, but "modeling complicated domain models" is supposed to be Joist's sweet spot, with validation rules, and reactive fields, reactions, etc.

But it was just a slog of tedious code, lots of bugs, lots of regressions, that all boiled down to us way, way underestimating how hard it was to constantly "reconstructing the draft" in our write path.

Granted, it sounds easy to say "just use the `author.draftVersion` in your writes", but in practice this was surprisingly easy to forget, even for engineers well-versed in the versioning scheme. We _could_ get it right, but bugs constantly slipped through.

After a few months went by, we were commisterating about "why are things so bad?" (we can pretend it was in one of those official Agile retrospectives) and finally realized--we were wrong.

We chose wrongs--we had chosen to "optimize reads", but we needed to "optimize writes" b/c that is where all the business logic/complexity fundamentally was.

### New Approach: Write to Identities

We were fairly ecastic about reversing direction, b/c it meant all of our write paths went back to "extremely boring" CRUD code:

```ts
// Look ma, no versioning code!
const author = await em.load(Author, "a:1");
if (author.shouldBeAllowedToUpdateFoo) {
  author.foo = 1;
}
```

...but what about those reads? Wouldn't just moving the super-complicated "reconstruct the draft" code from the writes, into "reconstruct the last" reads, be just as bad, or worse?

We wanted to avoid making the same mistake twice

## Rewrite Reads
