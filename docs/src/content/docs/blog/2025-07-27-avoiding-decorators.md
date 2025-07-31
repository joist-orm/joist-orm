---
title: Avoiding ORM Decorators
slug: blog/avoiding-decorators
date: 2025-07-27
authors: shaberman
tags: []
excerpt: Entity-based ORMs, going back to Java's Hibernate & earlier, often use decorators or annotations like `@PrimaryKey` to define the domain model; Joist pushes back on this pattern, and prefers schema-driven code generation.
---

Joist is an entity-based ORM, i.e. an `authors` table gets an `Author` class, to hold business logic (both simple and [complex validation rules](/modeling/validation-rules/#reactive-validation-rules), [reactive fields](/modeling/reactive-fields/), [lifecycle hooks](/modeling/lifecycle-hooks/), etc.):

```ts title="Author.ts"
class Author extends AuthorCodegen {
  // Example of trivial business logic...
  get fullName(): string {
    return this.firstName + ' ' + this.lastName;
  }
}
```

It's common for other entity-based ORMs to use decorators (in JavaScript/TypeScript, also called annotations in Java) to define the domain model itself, i.e. use a **code-first approach**.

For example, in MikroORM:

```ts title="Author.ts"
@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property({ unique: true })
  email!: string;

  @Property()
  firstName!: string;

  @Property()
  lastName!: string;

  @OneToMany(() => Order, order => order.user)
  orders = new Collection<Order>(this);
}
```

Or Java's Hibernate:

```java title="Author.java"
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<Order> orders;
}
```

Joist **avoids decorators**, and instead uses a **schema-first approach**, of reading, and code generating, the domain model from the database schema.

This results in pleasantly succinct entity files that are reminiscent of Rails ActiveRecord:

```ts
class User extends UserCodegen {
}
```

But there are a few more reasons than just succinctness for this approach.

## TypeScript Decorators are Painful

Because TypeScript decorators shipped years before the official JavaScript decorators, they are clunky to use, as they require build-time infra to bake their metadata into production builds/artifacts.

When using `tsc`, this is as simple as turning on `emitDecoratorMetadata`, but then projects are limited to `tsc`-derived tooling like `ts-node`, instead of more modern tooling like [tsx](https://github.com/privatenumber/tsx).

Admittedly, this should get better with official JavaScript decorators now shipped, but ORMs will have to migrate over to the new standard, which has slightly different (and less powerful, afaiu) semantics.

For Joist, instead of reading/encoding metadata from `@Column` decorators, Joist's `joist-codegen` looks at the database directly, and then generates a `metadata.ts` file that is imported on boot, and "just works" (this is similar to Mikro's [EntitySchema](https://mikro-orm.io/docs/metadata-providers#using-entityschema) approach, except that Joist *always* uses this approach, and makes it dead simple, instead of being something users have to fiddle with.)

## Decorators are not DRY

For simple primitive fields, like:

```ts
  @PrimaryKey()
  id!: number;
```

The `@PrimaryKey` line is just fine, but once decorators get more complex, they can become repetitive, i.e. for something like Hibernate's `OneToMany`:

```java
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<Order> orders;
```

The decorator arguments can get more & more complex, which is bad because it means:

* The engineer writing `orders` has to repeat "we want our m2o relations to behave like (...the typical arguments we've decided to use...)" across the codebase, or
* The engineer using `orders` has to wonder "how was this m2o relation configured? is it like all of our others, or different?"

Instead, Joist uses a declarative/automated approach (code generation): the "rules" or "output" for `varchar` columns is always the same, the output for `timestamptz` columns is always the same, for FK columns, etc.

Joist's approach drives consistency across the codebase: if we have 5 foreign key columns, or 100 foreign key columns, or 500 `timestamptz` columns (across our entire schema), they will all act "the same way".

This is especially important in large codebases, where consistency is key to maintainability and readability (avoiding violating the Principle of Least Surprise).

## Customization via Rules

If applications need different output than Joist's default output (i.e. handling `timestamptz` columns differently), Joist's preference is to encode these as config-file rules/flags that are applied *across the codebase* to a pattern of columns, instead of repeatively configured/decided on a column-by-column basis.

A great example of this is our [temporal](/getting-started/configuration/#temporal) config flag, which flips all date columns from being mapped as the built-in JavaScript `Date` type to `Temporal`-based types, which are much more ergonomic & correct to work with.

Other than `temporal`, we don't have many other customizations available, primarily because we've not needed them yet--if you do, feel free to open an issue on GitHub!

## Schema Should be Source of Truth

Joist's view is that, once your application is in production, writing "diff-based" migrations (i.e. [node-pg-migrate](https://github.com/salsita/node-pg-migrate/)) is the better than "code-first" schema management.

This is because the diff-based migrations are heavily grounded in "what is the production data *now*", vs. code-first migrations (from decorators or Prisma's domain model file), which make it almost "too easy" to make large, sweeping domain model changes, without engineer's really realizing (or at least deferring) how the production data will be brought along to the new world.

## Using `joist-config.json`

Joist is able to get ~90-95% of metadata it needs directly from the database, but there is always that last 5% of config that is not available in the database itself--things like renaming "other side" relations, STI inheritance behavior, and a few other things.

For these, Joist uses a `joist-config.json` file (see its [documentation](/getting-started/configuration/)).

This has been fine, but is still kind of a "least terrible" approach--eventually Joist might push *all* config into the database schema (via `COMMENTS` fields, which we use already for renaming FKs columns, or other tricks), or trying a "schema in a DSL" approach, similar to [entgo's schemadef](https://entgo.io/docs/schema-def) (which is admittedly a "code first" approach, but doesn't intermix the "schema definition" with "entity definition" like decorators do).
