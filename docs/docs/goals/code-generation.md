---
title: Code Generation
sidebar_position: 2
---

One of the primary ways Joist achieves ActiveRecord-level productivity and DRY-ness is by leveraging **schema-driven code generation**.

I.e. for an `authors` table, the initial `Author.ts` file is as clean & simple as:

```typescript
import { AuthorCodegen } from "./entities";

export class Author extends AuthorCodegen {}
```

Similar to ActiveRecord, Joist automatically adds all the columns to the `Author` class for free, without you having to re-type them in your domain object.

It does this for both:

- Primitive columns

  I.e. `first_name` can be set via `author.firstName = "bob"`

- Foreign key columns

  I.e. `book.author_id` can be set via `book.author.set(...)`

Unlike ActiveRecord, which does this via metaprogramming at program initialization time, Joist does this via build-time code generation (i.e. by running a `npm run joist-codegen` command).

This approach allows the generated types to be seen by the TypeScript compiler and IDEs, and so provide a type-safe view of your database.

### Evergreen Code Generation

Joist's code generation runs continually, after every migration/schema change, so your domain objects will always 1-to-1 match your schema, without having to worry about them mismatching or tediously keeping them in sync.

### Custom Business Logic

Even though Joist's code generation runs continually, it only touches the `Author.ts` once.

After that, all of Joist's updates are made only to a separate `AuthorCodegen.ts` file.

This makes `Author.ts` a safe space to add any custom business logic you might need, separate from the boilerplate of the various getters, setters, and relations that are isolated into "codegen" base class, and always overwritten.

See [Lifecycle Hooks](../features/lifecycle-hooks) and [Derived Fields](../features/derived-fields) for examples of how to add business logic.

### Declarative Customizations (TODO)

If you do need to customize how a column is mapped, Joist _should_ (these are not implemented yet) have two levers to pull:

1. Declare a rule based on the column's name and/or type

   In the `joist-codegen.json` config file, define all `timestampz` columns should be mapped as type `MyCustomDateTime`.

   This is preferable to per-column configuration/annotations because you can declare the rule once, and have it apply to all applicable columns in your schema.

2. Declare a specific user type for a column.

   In the `joist-codegen.json` config file, define the column's specific user type.

### Pros/Cons

This approach (continual, verbatim mapping of the database schema to your object model) generally assumes you have a modern/pleasant schema to work with, i.e. you don't have to map esoteric 1980s-style database column names to modern getter/setters, and you don't need your object model to look dramatically different from your database tables.

Which, in our opinion, is a simplification that largely helps avoid the [horror stories](https://blog.codinghorror.com/object-relational-mapping-is-the-vietnam-of-computer-science/) of ORMs, where the ORM is asked to do non-trivial translation between a database schema and object model that are fundamentally at odds.
