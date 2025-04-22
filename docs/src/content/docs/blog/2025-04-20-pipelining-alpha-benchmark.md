---
title: Pipelining Alpha Benchmark
slug: blog/pipelining-alpha-benchmark
date: 2025-04-20
authors: shaberman
tags: []
_excerpt: ...
---

I've known about Postgres's [pipeline mode](https://www.postgresql.org/docs/current/libpq-pipeline-mode.html) for a while, and finally have some alpha prototyping of pipelining in general, and alpha builds of Joist running with pipeline mode.

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

One wrinkle with pipelining is that, if 1 SQL statement fails, all requests that are "after it" in the pipeline are also aborted.

This generally means pipelining is only useful when executing multi-statement database transactions, where you're executing a `BEGIN` + some number of `INSERT`, `UPDATE`, and `DELETE` statements + `COMMIT`, and already expect them to all atomically commit.

Fortunately for us, this is typically what happens when a single backend request is committing multiple statements all at once, while atomically saving the endpoint's work to the database--and is exactly what Joist's `em.flush` does. :-)

## Benchmarking Wire Latency

Per above, network latency between your machine & the database is the biggest factor in pipelining's performance impact.

This can make benchmarking difficult and potentially misleading, because benchmarks often have the "web backend" and "the database" on the same physical machine, which means there is effectively zero network latency.

Thankfully, we can use solutions like Shopify's [toxiproxy](https://github.com/Shopify/toxiproxy) to introduce an artificial amount of latency to the network requests between our Node process and the Postgres database.

toxiproxy is particularly neat in that it's easy to run as a docker container, and control the latency via `POST` commands to a minimal REST API it exposes.

A docker-compose entry like:

```yaml
services:
  toxiproxy:
    image: ghcr.io/shopify/toxiproxy:2.12.0
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "5432:5432"
      - "8474:8474"
    volumes:
      - ./toxiproxy.json:/config/toxiproxy.json
    command: "-host=0.0.0.0 -config=/config/toxiproxy.json"
```

A `toxyproxy.json` like:

```json
[
  {
    "name": "postgres",
    "listen": "0.0.0.0:5432",
    "upstream": "db:5432",
    "enabled": true
  }
]
```

And a few curl requests:

```shell
curl -X POST http://localhost:8474/reset
curl -X POST http://localhost:8474/proxies/postgres/toxics -d '{
  "name": "latency_downstream",
  "type": "latency",
  "stream": "downstream",
  "attributes": { "latency": 2 }
}'
```

Is all we need to control exactly how much latency toxiproxy injects between every Node.js database call & our docker-hosted postgres instance.

## postgres.js Pipelining Results

We'll delve into Joist pipeline perf in a future post, but for now we'll stay closer to the metal and use [postgres.js](https://github.com/porsager/postgres) to directly execute SQL statements in a few different setups.

Note that were using postgres.js, instead of the venerable node-pg, because postgres.js implements pipelining, while node-pg does not yet. postgres.js also has an extremely seamless way to use pipelining--any statements issued within a `sql.begin` are automatically pipelined for us. Very neat!

### 0. Benchmark Setup

We'll be using mitata for these benchmarks, and test inserting `tag` rows into a single-column table.

Our configuration parameters are:

* `numStatements` the number of tags to insert
* `toxiLatencyInMillis` the latency in millis that toxiproxy should delay each statement

### 1. Sequential Inserts

In this benchmark, we insert tags with individual `await`s:

```ts
bench("sequential", async () => {
  await sql.begin(async (sql) => {
    for (let i = 0; i < numStatements; i++) {
      await sql`INSERT INTO tag (name) VALUES (${`value-${nextTag++}`})`;
    }
  });
});
```

We expect this to be the slowest, because it is purposefully "defeating" pipelining by waiting for each `INSERT` to finish before executing the next one.

### 2. Concurrent w/o Transaction

```ts
bench("concurrent", async () => {
  const promises = [];
  for (let i = 0; i < numStatements; i++) {
    promises.push(sql`INSERT INTO tag (name)VALUES (${`value-${nextTag++}`})`);
  }
  await Promise.all(promises);
});
```

Here we're executing the requests in parallel (a `Promise.all`) but __not__ using a transaction, which seems postgres.js can still execute them in parallel, but only by using all the connections in our connection pool.

We expect this to be fast, but is also not an approach we could use to "commit" our endpoint's results to the database, b/c we risk some of the `INSERT`s committing and others aborting. But we include it for curiosity, to see how postgres.js handles it.

### 3. Pipelining with return value

This is postgres.js's canonical way of invoking pipelining, return a `string[]` of SQL statements from the `sql.begin` lambda:

```ts
bench("pipeline (return string[])", async () => {
  await sql.begin((sql) => {
    const statements = [];
    for (let i = 0; i < numStatements; i++) {
      statements.push(sql`INSERT INTO tag (name) VALUES (${`value-${nextTag++}`})`);
    }
    return statements;
  });
});
```

We expect this to be fast, "because pipelining!"

### 4. Pipelining with Promise.all

This final example also uses postgres.js's pipelining, but by invoking the statements from within a `Promise.all`:

```ts
await sql.begin(async (sql) => {
  const statements = [];
  for (let i = 0; i < numStatements; i++) {
    statements.push(sql`INSERT INTO tag (name) VALUES (${`value-${nextTag++}`})`);
  }
  await Promise.all(statements);
});
```

This is particularly important for Joist, because even within a single `em.flush()` call, and a single `BEGIN`/`COMMIT` database transaction, we potentially have to make several "waves" of SQL updates (when `ReactiveQueryField`s are involved), and so can't always return a single `string[]` of SQL statements to execute.

We expect this to be fast as well.

## Results

```shell

```
