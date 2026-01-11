---
title: Bringing Back Unnest
slug: blog/bringing-back-unnest
date: 2026-01-11
authors: shaberman
tags: []
---

The latest Joist release brings back Joist's usage of the Postgres `unnest` function (see [the PR](https://github.com/joist-orm/joist-orm/pull/1692)), for a nice 9% bump on our alpha, latency-oriented benchmarks:

<img src="/images/unnest.png" alt="Unnest Performance" width="500" style="display: block; margin: 20px auto;" />

## What is `unnest`?

`unnest` is a Postgres function that takes an array and returns a set of rows, one for each element in the array. 

The simplest example is converting one array and turning it into a set of rows:

```sql
 select unnest(array[1, 2, 3]) as i;
 i
---
 1
 2
 3
(3 rows)
```

But you can also use multiple `unnest` statements to get multiple columns on those rows as well:

```sql
select unnest(array[1, 2, 3]) as id, unnest(array['foo', 'bar', 'zaz']) as first_name;
 id | first_name
----+------------
  1 | foo
  2 | bar
  3 | zaz
(3 rows)
```

## Why `unnest` is useful

`unnest` for doing batch SQL statements, such as inserting 10 authors in one `INSERT`; without `INSERT` you might have 4 columns * 10 authors = 40 query parameters:

```sql
INSERT INTO authors (first_name, last_name, publisher_id, favorite_color)
  VALUES (?, ?, ?, ?). -- #a1
    (?, ?, ?, ?), -- #a2
    (?, ?, ?, ?), -- #a3
    (?, ?, ?, ?), -- #a4
    (?, ?, ?, ?), -- #a5
    (?, ?, ?, ?), -- #a6
    (?, ?, ?, ?), -- #a7
    (?, ?, ?, ?), -- #a8
    (?, ?, ?, ?), -- #a9
    (?, ?, ?, ?) -- #a10
```

Where we have 10 `first_name` parameters, 10 `last_name` parameters, etc., but with `unnest` we can send up "just 1 array per column":

```sql
INSERT INTO authors (first_name, last_name, publisher_id, favorite_color)
  SELECT * FROM unnest(
    $1::varchar[], -- first_names
    $2::varchar[], -- last_names
    $3::int[],     -- publisher_ids
    $3::varchar[] -- colors
  )
```

The benefits of fewer query parameters are:

- Smaller SQL statements going over the wire (one of our benchmarks saw 41kb of SQL without `unnest`, and 350 bytes with `unnest`)
- "Stable" SQL statement that don't change for each "number of authors being updated", so will have better prepared statement cache hit rates

This is generally a well-known approach, i.e. TimeScale had a [blog post](https://www.tigerdata.com/blog/boosting-postgres-insert-performance) highlighting a 2x performance increase, albeit you have to get to fairly large update sizes to have this much impact.

## Bringing it back?

Joist had previously used `unnest` in our `INSERT`s and `UPDATE`s a few years ago, but we'd removed it because it turns out `unnest` is finicky with array columns--it "overflattens" and requires reactangular arrays.

(Array columns for storing multiple values `favorite_colors = ['red', 'blue']` in a single `varchar[]` column.)

The 1st unfortunate thing with `unnest` is that it "overflattens", i.e. if we want to update two author's `favorite_colors` columns using `unnest`, something like:

```sql
select * from unnest(array[array['red','blue'],array['green','purple']]);
 unnest
--------
 red
 blue
 green
 purple
(4 rows)
```

...wait, we got 4 rows instead of 2 rows.
