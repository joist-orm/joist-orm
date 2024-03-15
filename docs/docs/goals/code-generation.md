---
title: Code Generation
sidebar_position: 1
---

One of the primary ways Joist achieves ActiveRecord-level productivity is by generating the boilerplate part of domain models from the database schema.

## Beautiful Domain Models

To see this in action, for an `authors` table, in Joist the initial `Author.ts` domain model is as clean & simple as:

```typescript
import { AuthorCodegen } from "./entities";

export class Author extends AuthorCodegen {}
```

And that's it.

This is very similar to Rails ActiveRecord, where Joist automatically adds all the columns to the `Author` class for free, without having to re-type them in your domain object.

It does this for:

- Primitive columns, i.e. `first_name` can be set via `author.firstName = "bob"`
- Foreign key columns, i.e. `book.author_id` can be set via `book.author.set(...)`, and
- Foreign key collections, i.e. `Author.books` can be loaded via `await author.books.load()`.
- One-to-one relations, many-to-many collections, etc.

These columns/fields are added to the `AuthorCodegen.ts` file, which looks (redacted for clarity) something like:

```typescript
// This is all generated code
export abstract class AuthorCodegen extends BaseEntity {
  readonly books = hasMany(bookMeta, "books", "author", "author_id");
  readonly publisher = hasOne(publisherMeta, "publisher", "authors");

  // ...

  get id(): AuthorId | undefined { ... }
  get firstName(): string { ... }
  set firstName(firstName: string) { ...}
}
```

:::tip

Note that, while ActiveRecord leverages Ruby's runtime meta-programming to add getter & setters when your program starts up, Joist does this via build-time code generation (i.e. by running a `npm run joist-codegen` command).

This approach allows the generated types to be seen by the TypeScript compiler and IDEs, and so provides your codebase a type-safe view of your database.

:::

## What is Generated?

When running `npm run joist-codegen`, Joist will examine the database schema and generate:

- For each entity table (e.g. `authors`), an entity "codegen" file (`AuthorCodegen.ts`)
  
  This file is written out **every time** and contains the boilerplate code that can be deterministically inferred from the database schema, from example:

  - Fields for all primitive columns
  - Fields for all relations (references like `Book.author` and collections like `Author.books`)
  - Basic auto-generated validation rules (e.g. from not null constraints)

- For each entity table, an entity "working" file (`Author.ts`)

  This file is written out **only once** and is where custom business logic and validation rules can go, without it being over-written by the next time `joist-codegen` runs.

- For each entity table, a factory file (`newAuthor.ts`)

  This file provides tests with a succinct "one-liner" way to get a valid entity.

- A `metadata.ts` file with schema information.


## Evergreen Code Generation

Joist's code generation runs continually (although currently invoked by hand, i.e. individual `npm run joist-codegen` commands), after every migration/schema change, so your domain objects will always 1-to-1 match your schema, without having to worry about keeping the two in sync.

### Custom Business Logic

Even though Joist's code generation runs continually, it only touches the `Author.ts` once.

After that, all of Joist's updates are made only to the separate `AuthorCodegen.ts` file.

This makes `Author.ts` a safe space to add any custom business logic you might need, separate from the boilerplate of the various getters, setters, and relations that are isolated into "codegen" base class, and always overwritten.

See [Lifecycle Hooks](../modeling/lifecycle-hooks.md) and [Derived Fields](../modeling/derived-fields.md) for examples of how to add business logic.

### Declarative Customizations (TODO)

If you do need to customize how a column is mapped, Joist _should_ (these are not implemented yet) have two levers to pull:

1. Declare a schema-wide rule based on the column's type and/or naming convention

   In the `joist-config.json` config file, define all `timestampz` columns should be mapped as type `MyCustomDateTime`.

   This would be preferable to per-column configuration/annotations because you could declare the rule once, and have it apply to all applicable columns in your schema.

2. Declare a specific user type for a column.

   In the `joist-config.json` config file, define the column's specific user type.

## Pros/Cons

This approach (continual, verbatim mapping of the database schema to your object model) generally assumes you have a modern/pleasant schema to work with, and you don't need your object model to look dramatically different from your database tables.

Joist's assertion is that this strict 1-1 mapping is a feature, because it should largely help avoid the [horror stories of ORMs](https://blog.codinghorror.com/object-relational-mapping-is-the-vietnam-of-computer-science/), where the ORM is asked to do non-trivial translation between a database schema and object model that are fundamentally at odds.

## Why Schema First?

Joist's approach is "schema first", i.e. we first declare the database schema, and then generate the domain model from the database schema.

Along with "schema-first", there generally three approaches to domain model/database mapping:

1. Schema-first (generate code from the schema database, like Joist)
2. Code-first (generate the schema from the code, i.e. from `@Column` and `@ManyToOne` annotations in the domain model)
3. No automatic generation either way, just map the two by hand

Joist's assertion is that schema-first is the most pragmatic, b/c the database really is the "source of truth" for the data, and that code-first schema-generation does not scale once you have to production data that needs to be migrated that can sometimes, but not _always_, be migrated automatically.

(That said, code-first schema generates have gotten a lot more robust, so if you want to use a "model-first" schema management / migration library, that's fine; you could define your model in that, use it to apply/manage your database schema, and then generate your Joist domain model from the database schema.)
