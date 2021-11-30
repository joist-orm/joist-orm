---
title: N+1 Safety
sidebar_position: 2
---

Accidentally triggering N+1s is a common pitfall of ORMs, because the ORM's "pretending to be in memory objects" mental model can be a leaky abstraction: you can access 1,000 actually-in-memory objects very quickly in a `for` loop, but you can't access 1,000 _not_-actually-in-memory objects in a `for` loop.

Somewhat ironically/coincidentally (given the years of callback hell that Node/JS initially had to suffer through), Node/JS's single-threaded model is a boon to N+1 prevention because it forces all blocking I/O calls to be "identifiable", i.e. they _always_ require a callback or a promise.

The innovative [DataLoader](https://github.com/graphql/dataloader) library provides a convention for "recognizing" multiple blocking calls that happen within a single tick of the event loop, which is where N+1s usually sprout from, and combining them into batch calls.

Joist is built on DataLoader from the ground up, and nearly all SQL operations (i.e. `EntityManager.load`, `EntityManager.populate`, `EntityManager.find`, loading entity references/collections like `author.books.load()`, etc.) are all automatically batched, so N+1s should essentially never happen.

