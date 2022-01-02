---
title: Great Tests
sidebar_position: 4
---




A common fault of ORMs is the quickiness of their unit tests (not the ORM project's unit tests, like Joist's internal test suite, but the unit tests that users of Joist write for their own business logic using their own entities).

It's common for test execution times to be "okay" with a small schema of ~5-10 tables, but then to steadily degrade over time. For the "original Joist" (written in Java), this actually was the founding impetus because Hibernate, the Java ORM dejour of the time, a schema with 500 tables would take 30 seconds just to create the initial `Session` object, let alone run any actual unit test behavior.

Joist (both "original/Java Joist" and now joist-ts) take the hard-line approach that test time should be _constant_ with schema size. Tests on a 500-table schema should run just as quickly as a 20-table schema.

Obviously this will not be _exactly_ true in practice, but that is the guiding principle.

An example of this is how Joist exercises database resets: in general, between tests you need to `TRUNCATE` every entity table and reset it's primary key counter. Instead of issuing 1 `TRUNCATE` statement per table, Joist creates a `flush_database()` stored procedure at the very end of the "apply change migrations" build step, which internally has the "`N` number of tables" `TRUNCATE` statements. So now unit tests' `beforeEach` can issue a single wire call to get to a clean state before running.
