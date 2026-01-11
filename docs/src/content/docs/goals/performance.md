---
title: Performance
description: Joist's performance goals and optimizations.
sidebar:
  order: 5
---

## Best-in-class Performance

Joist has a nuanced stance on performance: we assert Joist-written code will generally issue _less queries_ and _more efficient_ queries, both leading to better performance, than the "default" day-to-day code written by most engineers*.

This is a bold claim, but it's also different from saying Joist will "always be the fastest way to perform any specific database query"--it won't. There are times when carefully-crafted, hand-written SQL queries are the best tool for the job. That's fine!

But for most day-to-day code, Joist peforms optimizations that most engineers won't bother doing:

- Joist always batches SQL updates during writes (`em.flush`),
- Joist always prevents N+1s during reads (`em.load` & `em.find`),
- Joist always caches entities in an identity map,
- Joist always uses `unnest` to reduce query parameter explosion in large operations

None of these individual optimizations themselves are novel; but they're each a little esoteric, each require remembering the best way to leverage them, and each might require restrustructing your code/SQL queries a certain way pull--all decisions that engineers should not have to re-remember to do for every endpoint, for every workflow, for every piece of business logic.

Most of our optimizations are focused on **reducing the total number of database queries** your code executes per endpoint/operation. So instead of 10 queries with 1-5ms of latency each, you only do 5 queries with the same 1-5ms latency each. Given that waiting on I/O is the bottleneck for most web applications, this can lead to significant performance improvements.

Joist is the best way for your application to leverage these techniques--by putting down the latest query builder dejure and letting us the handle (most of!) the queries for you.

## Benchmarks

We also care about benchmarks (and do well on them!).

But we also care about maintainability. And testing. And having a codebase that doesn't suck after five years of a rotating team of engineers working in it. So we love to geek out on performance optimizations, but always while balancing the trade-offs in real-world codebases.

In large, 50k or 500k or 1m LOC applications, engineers are either going to forget (at worst), or ideally just not care about, the optimizations that Joist performs all the time, every time.
