---
title: Sample Project
sidebar_position: 1
---

The [Joist Sample App](https://github.com/stephenh/joist-ts-sample) is a minimal repository setup with Joist.

It does not include exposing the domain objects via a REST/GraphQL/etc. API, but just shows a minimal setup for working solely with the domain objects.

## Running Locally

To run the sample project locally, run these commands:

- `git clone git@github.com:stephenh/joist-ts-sample.git`
- `cd joist-ts-sample`
- `npm i`
- `npm run joist-migrate`
- `npm test`

And you should see the tests pass.

## Example Workflow

A typical workflow for adding a new entity looks like:

- Run `npm run joist-new-migration "add publisher"`
- Edit the `migrations/...add-publisher.ts` file to include to create the new table:
  ```typescript
    createEntityTable(pgm, "publishers", {
      name: { type: "text", notNull: true },
    });
  ```
- Run `npm run joist-migrate` to apply the migration
- Run `npm run joist-codegen` to create/update the entities
- Copy/paste the `Author.test.ts` and write a test for the new `Publisher` entity


