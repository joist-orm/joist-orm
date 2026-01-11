---
title: Performance
description: Joist's performance philosophy
sidebar:
  order: 5
---

Joist has a nuanced stance on performance: we assert Joist-written code will issue _less queries_ and _more efficient_ queries than the "default" day-to-day code written by most engineers.

This is different from saying Joist will "always be the fastest way to perform any every database query"--it won't! There are times when carefully-crafted, handwritten SQL queries are best.

But for most day-to-day code, Joist performs optimizations that most engineers won't bother doing:

- Joist always batches SQL updates during writes (`em.flush`),
- Joist always prevents N+1s during reads (`em.load` & `em.find`),
- Joist always caches entities in an identity map,
- Joist always uses `unnest` to reduce query parameter explosion in large operations

None of these individual optimizations themselves are novel; but they're each a little esoteric, each require remembering the best way to leverage them, and each might require restructuring your code/SQL queries a certain way pull--all decisions that engineers should not have to re-remember to do for every endpoint, for every workflow, for every piece of business logic.

Our optimizations focus on **reducing the total number of database queries** your code executes. So instead of 10 queries with 1-5ms of latency each, you only do 5 queries with the same 1-5ms latency each. Given that waiting on I/O is the bottleneck for most web applications, this can lead to significant performance improvements.

Joist is the best way for your application to leverage these techniques--by putting down the latest query builder dejure and letting us the handle (most of!) the queries for you.

## Benchmarks

We also care about [benchmarks](https://github.com/joist-orm/joist-benchmarks) (and do surprisingly well on them!).

We say "surprisingly" somewhat in jest, because we care about performance--but we also care about maintainability. And testing. And having a codebase that doesn't suck after five years of a rotating team of engineers working in it. 😅

We love to geek out on performance optimizations 🚀, but always while balancing the trade-offs in real-world codebases. In large, 20k or 500k or 1m LOC applications, engineers are either going to **forget** (at worst), or ideally **just not have to care about**, the optimizations that Joist performs all the time, every time.

If anything, the point of our benchmarks is not necessarily "we expect Joist to always be the fastest", but rather given how much _other stuff_ Joist provides you, with negligible overhead or even _net performance wins_, it should be a no-brainer to use Joist for your application. 
