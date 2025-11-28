---
title: Using CTEs and Query Rewriting to Solve Versioning
slug: blog/query-rewriing-versioning
date: 2025-10-06
authors: shaberman
tags: []
---

Joist is an ORM primarily developed for Homebound's GraphQL majestic monolith, and we recently shipped a long-awaited Joist feature, **SQL query rewriting via a plugin API**, to deliver a key component of our domain model: _aggregate level versioning_.

We'll get into the nuanced details below, but it basically means providing this _minor_ "it's just a dropdown, right?" feature of a version selector:

<img src="/src/assets/version-dropdown.png" alt="Version dropdown" width="500" style="display: block; margin: 20px auto;" />

Where the user can:

- "Time travel" back to a previous version of what they're working on,
- Draft new changes (collaboratively with other users) that are not seen until they click "Publish" to make those changes active

And have the whole UI "just work" while they flip between the two.

As a teaser, after some fits & painful spurts, we achieved having our entire UI (and background processes) load historical "as of" values with just a few lines of setup/config per endpoint--and literally no other code changes.

Read on to learn about our approach!


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

## Making Reads not Suck

We spent awhile brainstorming "how to make our reads not suck"--i.e. avoid the tedious "remember to do version-aware reads" we'd been doing by hand for writes.

If you remember back to that screenshot from the beginning, we need our whole app/UI, at the flip of a dropdown, to automatically change every `SELECT` query from:

```sql
-- simple CRUD query
SELECT * FROM authors WHERE id IN (?) -- or whatever WHERE clause
```

To a "version-aware replacement":

```sql
-- find the right version row
SELECT * FROM author_versions av
WHERE av.author_id in (?) -- same WHERE clause
  AND av.first <= v10 -- and versioning
  AND (a.final IS NULL or a.final > v10)
```

And not only for top-level `SELECT`s but anytime `authors` is used in a query, i.e. in `JOIN`s:

```sql
-- simple CRUD query
SELECT b.* FROM books
  JOIN authors a on b.author_id = a.id
  WHERE a.first_name = 'bob';

-- use books_versions for the join *and* author_versions for the where
SELECT bv.* FROM book_versions bv
  -- get the right author version
  JOIN author_versions av ON
    bv.author_id = av.id AND (av.first <= v10 AND (av.final IS NULL or a.final > v10))
  -- get the right book version
  WHERE bv.first <= v10 AND (bv.final IS NULL or a.final > v10)
  -- predicate should use the version table
  WHERE av.first_name = 'bob';
```

### 1. Initial Idea: Using CTEs

When it's articulated like "we want _every table access to routed to the versions table_", a potential solution starts to emerge...

Ideally we want to magically "swap out" `authors` with "a virtual `authors` table" that automatically has the right version-aware values. How could we do this, as easily as possible?

It turns out a CTE is a great way of structuring this:

```sql
-- create the fake/version-aware authors table
WITH _authors (
  SELECT
    -- make the columns look exactly like the regular table
    av.author_id as id,
    av.first_name as first_name
  FROM author_versions
  WHERE (...version matches...)
)
-- now the rest of the application's SQL query as normal, but we swap out
-- any `authors` table with our `_authors` CTE
SELECT * FROM _authors a
WHERE a.first_name = 'bob'
```

And that's (almost) it!

Now anytime our app wants to "read authors", regardless of the SQL query it's making, it will get the right version-aware values.

We technically have three things left to do:

1. Add the request-specific versioning config to the query
2. Inject this rewriting as seamlessly as possible
3. Evaluate the performance impact

### 2. Adding Request Config via CTEs

We have a good start, in terms of a hard-coded prototype SQL query, but now we need to get the `first <= v10 AND ...` pseudo code in the previous SQL snippets actually working.

Instead of a hard-coded `v10`, we need queries to use:

- Request-specific versioning (i.e. looking at, or "pinning", to `PlanPackage` v10), but also
- Pinning multiple different aggregate roots (i.e. the user is looking at `PlanPackage` v10 but `DesignPackage` v15, in the same request, or background job).

CTEs are our new hammer--let's add another for this, calling it `_pins` that uses the `VALUES` syntax to synthesize a table:

```sql
WITH _pins (
  SELECT plan_id, version_id FROM
   -- parameters added to the query, one "row" per pinned aggregate
  VALUES (?, ?), (?, ?)
), _authors (
  -- the CTE from previous section but now joining into _pins to get
  -- the versioning info
  SELECT
    av.author_id as id,
    av.first_name as first_name
  FROM authors a
  JOIN _pins p ON a.plan_id = p.id
  -- now we know:
  -- a) what plan the author belongs to (a.plan_id, i.e. its aggregate root)
  -- b) what version of the plan we're pinned to (p.version_id)
  -- so we can use them in our JOIN clause
  JOIN author_versions av ON (
    av.author_id = a.id AND
    av.first_id >= p.version_id AND (
      av.final_id IS NULL OR av.final_id < p.version_id 
    )
  )
)
SELECT * FROM _authors a WHERE a.first_name = 'bob'
```

Now our application can "pass in the config" (i.e. for this request, `plan:1` uses `v10`, `plan:2` uses `v15`) as extra query parameters into the query, they'll be added as rows to the `_pins` CTE table, and then the rest of the query will resolve versions using that data.

Getting closer!

One wrinkle is that the query so far requires us to "pin" every plan we want to read, b/c if a plan doesn't have a row in the `_pins` CTE, then the `INNER JOIN`s will not find any `p.version_id` available, and none of its data will match.

Ideally any plan (aggregate root) that is not explicitly pinned should default to its active data; which we can do with (...wait for it...) another CTE:

```sql
WITH _pins (
  -- the injected config _pins stays the same as before
  SELECT plan_id, version_id FROM
  VALUES (?, ?), (?, ?)
), _plan_versions (
   -- we add an additional CTE that defaults all plans to active unless pinned
  SELECT
    plans.id as plan_id,
    -- prefer `pins.version_id` but fallback on `active_versionn_id`
    COALESCE(pins.version_id, plans.active_version_id) as version_id,
  FROM plans
  LEFT OUTER JOIN _pins pins ON pins.plan_id = plans.id
)
_authors (
  -- this now joins on _plan_versions instead _pins directly
  SELECT
    av.author_id as id,
    av.first_name as first_name
  FROM authors a
  JOIN _plan_versions p ON a.plan_id = p.id
  JOIN author_versions av ON (
    av.author_id = a.id AND
    av.first_id >= p.version_id AND (
      av.final_id IS NULL OR av.final_id < p.version_id 
    )
  )
)
SELECT * FROM _authors a WHERE a.first_name = 'bob'
```

We've basically got it, in terms of a working prototype--now we just need to drop it into our application code, ideally as easily as possible.

### 3. Injecting the Rewrite Automatically

We've discovered a scheme to make reads _automatically version-aware_--now we want our application to use it, basically all the time, without us messing up or forgetting the rewrite incantation.

Given that a) we completely messed this up the 1st time around, and b) this seems like a very mechanical translation, **what if we could automate it?** For every read?

Our application already does all reads through Joist (of course :sweat:), as `em.load` or `em.find` calls:

```ts
// Becomes `SELECT * FROM authors`
const a = em.load(Author, "a:1");
// Becomes `SELECT * FROM authors WHERE ...`
const as = em.find(Author, { firstName: "bob" });
```

It would be really great if these `em.load` and `em.find` queries were all magically rewritten--so that's what we did.

We built a Joist plugin that intercepts all `em.load` or `em.find` queries (in a plugin hook called `beforeFindQuery`), and rewrites the query's ASTs to be version-aware, before they are turned into SQL and sent to the database.

So now what our UI code does is:

```ts
// At the start of a version-aware endpoint...
const plugin = new VersioningPlugin();
// Read REST/GQL params to know which versions to pin
plugin.pin(PlanPackage, v10);
plugin.pin(DesignPackage, v18);
em.addPlugin(plugin);

// Now just use the em as normal and all operations will automatically
// be tranlated into the `...from author_versions..` SQL
const a = await em.load(Author, "a:1");
```
