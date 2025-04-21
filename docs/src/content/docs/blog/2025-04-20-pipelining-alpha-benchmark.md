---
title: Pipeling Alpha Benchmark
slug: blog/pipeling-alpha-benchmark
date: 2025-04-20
authors: shaberman
tags: []
_excerpt: ...
---

I've known about Postgres's [pipeline mode](https://www.postgresql.org/docs/current/libpq-pipeline-mode.html) for awhile, and have finally done some alpha prototyping of pipelining in general, and create alpha builds of Joist running with pipeline mode.

This post is an intro to pipelining and covers my experiments so far.

## What is Pipelining?

Pipelining, as a term in networking, allows clients to send multiple requests, immediately one after each other, without first waiting for the server to respond.

Specifically for Postgres, this would let a client do something like:

- Send an `INSERT` for authors,
- Immediately send an `INSERT` for books
- Immediately Send an `UPDATE` for book reviews
- ...Wait several millis for the database to respond...
- Receive the `INSERT` authors response
- Receive the `INSERT` books response
- Receive the `UPDATE` book reviews response

This is much better than the alternative, which is:

- Send an `INSERT` for authors
- ...Wait several millis...
- Receive the `INSERT` authors response
- Send an `INSERT` for books
- ...Wait several millis...
- Receive the `INSERT` books response
- Send an `UPDATE` for book reviews
- ...Wait several millis...
- Receive the `UPDATE` book reviews response

In this 2nd example, we have 3x as many "waits".

This "wait for several millis" is a combination of:

1. How long it takes the database to process each request, and
2. How long it takes the network to send the request and response over the wire.

As we'll see later, this 2nd one has the biggest impact on pipelining's performance benefit--the larger the network latency, the more benefit pipelining has.

## Transactions Required

One wrinkle with pipelining, is that if 1 SQL statement fails, all others requests that are "in the pipeline" fail after it, and are aborted.

This generally means pipelining is only useful when executing a multi-statement database transaction, where a single backend request has several/many SQL statements it wants to commit all at once--is exactly describes Joist's `em.flush`. :-)

## Importance of Wire Latency

Per above, network latency between your machine & the database is the biggest factor in pipelining's performance impact.

This can make benchmarking difficult and potentially misleading, because benchmarks often have the "web backend" and "the database" on the same physical machine, which means there is effectively zero network latency.

Thankfully, we can use solution's like Shopify's [toxiproxy](https://github.com/Shopify/toxiproxy) to introduce an artificial amount of latency to the network requests between our Node process and the Postgres database.

toxiproxy is particularly neat in that it's easy to run as a docker container, and control the latency via `POST` commands to a minimal REST API it exposes.
