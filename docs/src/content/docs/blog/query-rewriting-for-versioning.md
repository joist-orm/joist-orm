---
title: Using CTEs and Query Rewriting to Solve Versioning
slug: blog/query-rewriing-versioning
date: 2025-10-06
authors: shaberman
tags: []
---

Joist is an ORM primarily developed for Homebound's GraphQL majestic monolith, and we recently shipped a long-awaited Joist feature, **SQL query rewriting via a plugin API**, to deliver a key component of our domain model: _aggregate level versioning_.

We'll get into all the nuanced details below, but it basically means providing this minor "it's just a dropdown, right?" feature of a version selector:

<img src="/src/assets/version-dropdown.png" alt="Version dropdown" width="500" style="display: block; margin: 20px auto;" />

Where the user can:

- "Time travel" back to a previous version of what they're working on,
- Draft new changes (collaboratively with other users) that are not seen until "Published"

And, during all this, the whole UI still "just works".

## Aggregate What Now?

Besides just "versioning", I called this "aggregate versioning"--what is that?

It's different from traditional database-wide, time-based versioning, that auditing solutions like [cyanaudit](https://pgxn.org/dist/cyanaudit/) or temporal `FOR SYSTEM_TIME AS OF` queries provide (although we do use cyanaudit for our audit trail & really like it!).

Let's back up and start with "aggregate". An aggregate is a cluster of ~2-10+ "related entities" in your domain model (or "related tables" in your database schema). The cluster of course depends on your specific domain--examples might be "an author & their books", or "a customer & their bank accounts & profile information".

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
* `author_versions`  table: stores snapshots of the author over time (`author_id`, `first_name`, `last_name`), with 1 row per *version* of each author (we call this the "version" table)

This is an extremely common approach for versioning schemas, i.e. it's effectively the same schema suggested by PostgreQL's [SQL2011Temporal](https://wiki.postgresql.org/wiki/SQL2011Temporal#System_Time) docs, albeit technically they're tracking system time, like an audit trail, and not our user-driven versioning.

This leads to a few differences: the `SQL2011Temporal` history tables use a `_system_time daterange` column to present "when each row was applicable in time" (tracking system time), while we use two FKs that also form a range, but the range is not time-based, it's version-based: "this row was applicable starting at `first=v5` until `final=v10`".

So if we had three versions of an `Author` in our `author_versions` table, it would look like:

* `id=10 author_id=1 first_id=v10 final_id=v15 first_name=bob last_name=smith`
   * From versions `v10` to `v15`, the `author:1` had a `firstName=bob`
* `id=11 author_id=1 first_id=v15 final_id=v20 first_name=fred last_name=smith`
   * From versions `v10` to `v20`, the `author:1` had a `firstName=fred`
* `id=11 author_id=1 first_id=v20 final_id=null first_name=fred last_name=brown`
   * From versions `v20` to now, the `author:1` had a `lastName=brown`

We found this `_versions` table strikes a good balance of tradeoffs:

* It only stores changed rows--if `v20` of the aggregate root (i.e. our `PlanPackage`) only changed the `Author`s and two of its `Book`s, there will only be 1 `author_versions` and two `book_versions`, even if the Author has 100s of books (i.e. we avoid making full copies of the aggregate root on every version)
* When a row does change, we snapshot the entire row, instead of tracking only specific columns changes (storing the whole row takes more space, but makes historical/versioned queries much easier)
  * Technically we only include mutable columns in the `_versions` table, i.e. our entities often have immutable columns (like `type` flags or `parent` references) and we don't bother copying these into the `_versions` tables.
* We only store 1 version row "per version"--i.e. if, while making `PlanPackage` `v20`, an `Author`s first name changes multiple times, we only keep the latest value in the draft `author_versions`s row.
  * This is different from auditing systems like SQL2011Temporal `_history` rows are immutable, and every change must create a new row--we did not need/want this level of granularity for application-level versioning.

With this approach, we can reconstruct historical versions by only querying the singular "effective version" for each entity, with queries like:

```sql
select * from author_versions av
join authors a on av.author_id = a.id
where a.id in ($1)
  and av.first_id <= $2
  and (av.final_id is null or av.final_id < $3)
```

Where:

- `$1` is whatever authors we're looking for
- `$2` is the version of the aggregate root we're "as of", i.e. v10
- `$3` is the same aggregate of "as of", i.e. v10

The condition of `first <= v10 < final` finds the singular `author_version` that is "effective" or "active" in v10, even if the version itself was created in v5 (and either never replaced, or not replaced until "some version after v10" like v15).

### ...but what is "Current"?

The `authors` and `author_versions` schema is hopefully fairly obvious/intuitive, but I left out a wrinkle: what data is stored in the `authors` table itself?

Obviously it should be "the data for the author"...but which version of the author? The latest published data? Or latest/WIP draft data?

Auditing solutions always put "latest draft" in `authors`, but that's because the application itself is reading/writing data from `authors`, and often doesn't even know auditing `author_versions` tables exist--but in our app, we need workflows & UIs to regularly read "the published data" & _ignore the WIP drafts_.

So we considered the two options:

1. The `authors` table stores the _latest draft_ version (as in SQL2011Temporal), or
1. The `authors` table stores the _latest published_ version,

We sussed out pros/cons in a design doc:

* Option 1. Store "latest draft" data in `authors`
  * Pro: Writes with business logic "just read the Author and other entities" for validation
  * Con: All readers, _even those that just want the published data_, must use the `_versions` table to "reconstruct the published/active author"
* Option 2. Store the "latest published" data in `authors`
  * Pro: The safest b/c readers that "just read from `authors`" will not accidentally read draft/unpublished data (a big concern for us)
  * Pro: Any reader that wants to "read latest" doesn't have to know about versioning at all, and can just read the `authors` table as-is (also a big win)
  * Con: Writes that have business logic must first "reconstruct the draft author" (and its books and it book reviews) from the `_versions` tables

:::tip

By "reconstruct the [published or draft] author", what we mean is that instead of "boring CRUD code" that just `SELECT`s from the `authors`, `books`, etc. tables, version-aware code must:

- a) actually read from the `author_verisons`, `book_versions` tables,
- b) know "which version" it should use to find those authors/books
  - ...and we might be looking for "PlanPackage v10" but "DesignPackage v8" so track _multiple, contextual versions_ within a single request, not just a single "as of" timestamp
- c) do version-aware graph traversal, i.e. a "boring CRUD" of `for (const books in author.books.get)` needs to use the version-aware `book_versions.author_id` instead of the `books.author_id`, b/c the `Book` might have changed its `Author` over time.
  - So nearly _every graph navigation_ needs checked for "is this relation actually versioned?", and if so, opt-into the more complex, version-aware codepath.

:::

This "reconstruction" problem seemed very intricate/complicated, and we did not want to update our legacy callers (**mostly reads**) to "do all this crazy version resolution", so after the usual design doc review, group comments, etc., we decide to __store latest published in `authors`__.

The key decisions being:

- We really did not want to instrument our legacy readers know about `_versions` tables to avoid seeing draft data
- We thought "teaching the writes to 'reconstruct' the draft subgraph" when applying validation rules would be the lesser evil.

(You can tell I'm foreshadowing this was maybe not the best choice.)

### Initial Approach: Not so great

With our versioning scheme in place, we started a large project for our first versioning-based feature: allowing home buyers to deeply personalize the products (sinks, cabinet hardware, wall paint colors, etc) in the home their buying (i.e. in v10 of Plan 1, we offered sinks 1/2/3, but in v11 of Plan 1, we now offer sinks 3/4/5).

And it was a disaster. 

This new feature set was legitimately complicated, but "modeling complicated domain models" is _supposed to be Joist's sweet spot_--what was happening?

We kept having bugs, regressions, and accidental complexity--that all boiled down to the write path (mutations) having to constantly "reconstruct the drafts" that it was reading & writing.

Normally in Joist, a `saveAuthor` mutation just "loads the author, sets some fields, and saves".

But with this versioning scheme:

- the `saveAuthor` mutation has to first "reconstruct the `Author` from the `author_versions` (if it exists)
- any writes cannot be set "just on the `Author`", they need to be queued into the draft `AuthorVersion`
- any Joist hooks or validation rules **also** need to do the same thing:
  - validation rules have to "reconstruct the draft" view of the author + books + book reviews subgraph of data they're validating,
  - hooks that want to make changes must also "stage the change" into a draft `BookVersion` or `BookReviewVersion` instead of "just setting some `Book` fields".

We had helper methods for most of this--but it was still terrible.

After a few months of this, we were commisterating about "why does this suck so much?" and finally realized--well, duh, we were wrong:

We had chosen to "optimize reads" (they could "just read from `authors`" table).

But, in dong so, we threw writes under the bus--they needed to "read & write from drafts"--and it was **actually our write paths that are the most complicated part of our application**--validation rules, side-effects, business process, all happen on the write path.

We needed the write path to be easy.

### New Approach: Write to Identities

We were fairly ecastic about reversing direction, and storing drafts/writes directly in `authors`, `books`, etc.

This would drastically simplify all of our write paths (GraphQL mutations) based to "boring CRUD" code:

```ts
// Look, no versioning code!
const author = await em.load(Author, "a:1");
if (author.shouldBeAllowedToUpdateFoo) {
  author.foo = 1;
}
await em.flush();
```

...but what about those reads? Wouldn't moving the super-complicated "reconstruct the draft" code out of the writes (yay!), over into "reconstruct the published" reads (oh wait), be just as bad, or worse?

We wanted to avoid making the same mistake twice, and just "hot potatoing" the write path disaster over to the read path.

## The Aha! Query Rewriting

We spent awhile brainstorming "how to make our reads not suck".

If you remember back to that screenshot from the beginning, we need our whole app/UI, at the flip of a dropdown, to automatically change every `SELECT` query from:

- `SELECT * FROM authors WHERE ...`, to:
- `SELECT * FROM author_versions WHERE ... AND (version matches)`

And not only for top-level `SELECT` but anytime `authors` is used in a query, i.e. in `JOIN`s:

- `JOIN authors a ON b.author_id = a.id` to:
- `JOIN author_versions av ON b.author_id = av.id AND (version matches)`

When it's articulated like "we want _every table access to be versioned_", a potential solution starts to emerge...

Let's start with the simplest query, reading an author:

```sql
SELECT * FROM authors WHERE id IN (?);
```

We know the "version-aware replacement" for that is:

```sql
SELECT * FROM author_versions av
WHERE av.id in (?) AND av.first <= v10 AND (a.final IS NULL or a.final > v10)
```

This seems like a fairly mechanical translation--**what if we could automate that?**

Ideally without either: a) our application code, or b) the rest of the surrounding SQL query (like `JOIN`s and `WHERE` clauses), even knowing/caring that we've done the rewrite.

It's almost like we want a "virtual `author`s" table--maybe something like:

```sql
-- create a version aware authors table
WITH _authors (
  SELECT
    -- make the version look exactly like the regular table
    av.author_id as id,
    av.first_name as first_name
  FROM author_versions
  WHERE (...version matches...)
)
-- the rest of the application's SQL query as normal, but we swap out
-- `FROM authors` for `FROM _authors`
SELECT * FROM _authors a
WHERE a.first_name = 'bob'
```

And then anytime our app wants "to read `authors`", we quickly swap it out to "oh you actually want to read from  `_authors`".

## Adding More CTEs

This is a good start! But how do we get that `...version matches...` working? We need to inject the versioning data into the query, particularly in a way that lets multiple aggregates be pinned to their own respective versions (i.e. `PlanPackage` is on v10 but the `DesignPackage` is on its v15).

We'll add another CTE for this:

```sql
WITH _pins (
  SELECT plan_id, version_id FROM
  VALUES (?, ?), (?, ?) -- parameters added to the query
), _authors (
  -- the CTE from above but know joining into _pins to get
  -- the versioning info
  SELECT
    av.author_id as id,
    av.first_name as first_name
  FROM authors a
  JOIN _pins p ON a.plan_id = p.id
  JOIN author_versions av ON (
    av.author_id = a.id AND
    av.first_id >= p.version_id AND (
      av.final_id IS NULL OR av.final_id < p.version_id 
    )
  )
)

```

And then our query adds `[plan:1, v10, plan:2, v15]` as extra parameters for the `_pins` table to read as config data.


## Joist Integration

We already, of course, use Joist to do all our reads, so what the API/UI code actually does is a "logical" read like:

```ts
const a = await em.load(Author, "a:1");
```

And then Joist "generates the boilerplate SQL"...what if we could have Joist generate "slightly different SQL"?

That's what we did--we built a Joist plugin that intercepts all `em.load` or `em.find` queries (in a hook called `beforeFindQuery`), and "injects" versioning joins into them, before they are turned into SQL and sent to the database.

So now what our UI code does is:

```ts
const plugin = new VersioningPlugin();
plugin.pin(PlanPackage, v10);
plugin.pin(DesignPackage, v18);
em.addPlugin(plugin);

// Now just use the em as normal and this will be the
// `...from author_versions..` SQL
const a = await em.load(Author, "a:1");
```
