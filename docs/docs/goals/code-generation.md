---
title: Code Generation
sidebar_position: 1
---

One of the primary ways Joist achieves ActiveRecord-level productivity and DRY-ness is by leveraging **continual, schema-driven code generation**.

I.e. for an `authors` table, the initial `Author.ts` file is as clean & simple as:

```typescript
import { AuthorCodegen } from "./entities";

export class Author extends AuthorCodegen {}
```

Similar to ActiveRecord, Joist automatically adds all the columns to the `Author` class for free, without you having to re-type them in your domain object. It does this for:

- Primitive columns, i.e. `first_name` can be set via `author.firstName = "bob"`
- Foreign key columns, i.e. `book.author_id` can be set via `book.author.set(...)`, and
- Foreign key collections, i.e. `Author.books` can be loaded via `await author.books.load()`.
- One-to-one relations, many-to-many collections, etc.

These columns/fields are added to the `AuthorCodegen.ts` file, which looks (heavily redacted for clarity) something like:

```typescript
// This is all generated code
export abstract class AuthorCodegen extends BaseEntity {
   readonly books: Collection<Author, Book> = hasMany(
           bookMeta,
           "books",
           "author",
           "author_id",
   );

   readonly publisher: Reference<Author, Publisher, undefined> = hasOne(
           publisherMeta,
           "publisher",
           "authors",
   );

   // ...

   get id(): AuthorId | undefined {
      return this.__orm.data["id"];
   }

   get firstName(): string {
      return this.__orm.data["firstName"];
   }

   set firstName(firstName: string) {
      setField(this, "firstName", firstName);
   }
}
```
:::tip

Note that, while ActiveRecord leverages Ruby's runtime meta-programming to add getter & setters when your program starts up, Joist does this via build-time code generation (i.e. by running a `npm run joist-codegen` command).

This approach allows the generated types to be seen by the TypeScript compiler and IDEs, and so provides your codebase a type-safe view of your database.

:::

### Understanding the Generated Code

Joist will generate:

- Each codegen entity file (`AuthorCodegen.ts`) (every time)
  - Contains the generated `AuthorCodegen` class that extends `BaseEntity`
  - Contains fields for all primitive columns
  - Contains fields for all relations (references and collections)
  - Contains auto-generated validations (from not null constraints)
- Each working entity file (`Author.ts`) (just once)
  - Contains an empty `Author` class that extends `AuthorCodegen`
- Each entity factory file (`Author.factories.ts`) (just once)
- A `metadata.ts` file with schema information (every time)

### Evergreen Code Generation

Joist's code generation runs continually (although currently invoked by hand, i.e. individual `npm run joist-codegen` commands), after every migration/schema change, so your domain objects will always 1-to-1 match your schema, without having to worry about keeping the two in sync.

### Custom Business Logic

Even though Joist's code generation runs continually, it only touches the `Author.ts` once.

After that, all of Joist's updates are made only to the separate `AuthorCodegen.ts` file.

This makes `Author.ts` a safe space to add any custom business logic you might need, separate from the boilerplate of the various getters, setters, and relations that are isolated into "codegen" base class, and always overwritten.

See [Lifecycle Hooks](../modeling/lifecycle-hooks.md) and [Derived Fields](../modeling/derived-fields.md) for examples of how to add business logic.

### Declarative Customizations (TODO)

If you do need to customize how a column is mapped, Joist _should_ (these are not implemented yet) have two levers to pull:

1. Declare a schema-wide rule based on the column's type and/or naming convention

   In the `joist-codegen.json` config file, define all `timestampz` columns should be mapped as type `MyCustomDateTime`.

   This would be preferable to per-column configuration/annotations because you could declare the rule once, and have it apply to all applicable columns in your schema.

2. Declare a specific user type for a column.

   In the `joist-codegen.json` config file, define the column's specific user type.

### Pros/Cons

This approach (continual, verbatim mapping of the database schema to your object model) generally assumes you have a modern/pleasant schema to work with, and you don't need your object model to look dramatically different from your database tables.

And specifically Joist's assertion is that this 1-1 restriction is a feature, because it should largely help avoid the [horror stories of ORMs](https://blog.codinghorror.com/object-relational-mapping-is-the-vietnam-of-computer-science/), where the ORM is asked to do non-trivial translation between a database schema and object model that are fundamentally at odds.
