---
title: Enums
description: Documentation for Enums
sidebar:
  order: 3
---

Joist supports enum tables for modeling fields that can be set to a fixed number of values (i.e. a `state` field that can be `OPEN` or `CLOSED`, or a field `status` field that can be `ACTIVE`, `DRAFT`, `PENDING`, etc.)

### What's an Enum Table

Enum tables are a pattern where each enum (`Color`) in your domain model has a corresponding table (`colors`) in the database, with rows for each enum values.

For example, for a `Color` enum with values of `Color.RED`, `Color.GREEN`, `Color.Blue`, the `color` table would look like:

```console
joist=> \d color;
                 Table "public.color"
 Column |  Type   | Nullable |              Default
--------+---------+----------+-----------------------------------
 id     | integer | not null | nextval('color_id_seq'::regclass)
 code   | text    | not null |
 name   | text    | not null |
Indexes:
    "color_pkey" PRIMARY KEY, btree (id)
    "color_unique_enum_code_constraint" UNIQUE CONSTRAINT, btree (code)
```

With rows for each value:

```console
joist=> select * from color;
 id | code  | name
----+-------+-------
  1 | RED   | Red
  2 | GREEN | Green
  3 | BLUE  | Blue
(3 rows)
```

Which are codegen'd into TypeScript enums:

```typescript
export enum Color {
  Red = "RED",
  Green = "GREEN",
  Blue = "BLUE",
}
```

And then other domain entities use foreign keys to point back to valid values:

```console
\d authors
                          Table "public.authors"
   Column           |           Type           | Nullable |                Default
--------------------+--------------------------+----------+----------------------------------------
 id                 | integer                  | not null | nextval('authors_id_seq'::regclass)
 name               | character varying(255)   | not null |
 favorite_color_id  | integer                  |          |
 created_at         | timestamp with time zone | not null |
 updated_at         | timestamp with time zone | not null |
Indexes:
    "authors_pkey" PRIMARY KEY, btree (id)
    "authors_favorite_color_id_index" btree (size_id)
Foreign-key constraints:
    "authors_favorite_color_id_fkey" FOREIGN KEY
       (favorite_color_id) REFERENCES color(id)
```

## Why Tables?

There are multiple ways to model enums, i.e. other options are database-native enums (which Joist does support, see below), or using enum values declared solely within your codebase.

Joist generally recommended/refers the enum table pattern because:

- The foreign keys enforce data integrity at the database-level

  (Database-native enums do this as well, codebase-only enums would not.)

- Ability to store `code` vs. `name`.

  Although minor, it's nice to have a dedicated `name` field to store the display name for enum values, and have them available in the database for updating/looking up.

- Ability to add extra columns (see later)

  Joist supports adding addition columns to the code, so like `color.customization_cost` could be an additional column on the `color` table that Joist will automatically expose to the domain layer.

- Changing enum values is generally simpler DML instead of DDL

  With a `color` table, adding/removing new values is just `INSERT`s / `UPDATE`s, whereas database-native enums require `ALTER`s to change the type.

## Enum Details and Extra Columns

Besides the basic `Color` enum, Joist generates "details" types, i.e. `ColorDetails` that include more information about each enum:

```typescript
export type ColorDetails = { id: number; code: Color; name: string };

const details: Record<Color, ColorDetails> = {
  [Color.Red]: { id: 1, code: Color.Red, name: "Red" },
  [Color.Green]: { id: 2, code: Color.Green, name: "Green" },
  [Color.Blue]: { id: 3, code: Color.Blue, name: "Blue" },
};
```

Which you can lookup via static methods on the `ColorDetails` class:

```typescript
export const Colors = {
  getByCode(code: Color): ColorDetails;

  findByCode(code: string): ColorDetails | undefined;

  findById(id: number): ColorDetails | undefined;

  getValues(): ReadonlyArray<Color>;

  getDetails(): ReadonlyArray<ColorDetails>;
};
```

Also, as mentioned before, if you add additional columns to the `color` table, they will be added to the `ColorDetails` type, i.e.:

```typescript
b.addColumn("color", { sort_order: { type: "integer", notNull: true, default: 1 } });
```

Will result in a `ColorDetails` that looks like:

```typescript
export type ColorDetails = {
  id: number;
  code: Color;
  name: string;
  sortOrder: 1 | 2 | 3;
};
```

Currently, "extra details columns" only supports primitive columns (integers, strings, etc.), i.e. not other enums, JSONB columns, or arrays.

## Integrated with Testing

During tests, `flush_database` will skip enum tables, so they do not need to be re-populated each time.

## Enum Arrays

If you want to store a list of enums in a single column (for example, instead of just `Author.favoriteColor`, you want `Author.favoriteColors`), Joist supports modeling that as a `int[]` column, i.e.:

```console
joist=> \d authors;
                        Table "public.authors"
   Column         |           Type           | Nullable |               Default

------------------+--------------------------+----------+-----------------------------------
--
 id               | integer                  | not null | nextval('authors_id_seq'::regclass
)
 first_name       | character varying(255)   | not null |
 favorite_colors  | integer[]                |          | ARRAY[]::integer[]
 created_at       | timestamp with time zone | not null |
 updated_at       | timestamp with time zone | not null |
Indexes:
    "authors_pkey" PRIMARY KEY, btree (id)
```

Note that Postgres does not yet support foreign key constraints on array columns, so you'll lose that aspect of data integrity with enum arrays.

Also, because of this lack of foreign key constraint, Joist cannot use that to know "what enum type is this column?"

As an admittedly hacky approach, we encode that information in a schema comment:

```typescript
b.addColumns("authors", {
  favorite_colors: {
    type: "integer[]",
    comment: `enum=color`,
    notNull: false,
    default: PgLiteral.create("array[]::integer[]"),
  },
});
```

## When to Use Enums

In general, you should only use enums when you have business logic that directly branches based on the values.

For an example, if your system has a list of "markets", and you only have ~2-3 markets, it can be tempting to think of `Market` as an enum, because currently there are only a few of them. And if you make it an enum, then `flush_database` will not reset the `market` table, so you don't have to keep adding test data that is "we have markets 1/2/3".

However, now adding/removing new markets changes the `Market` enum, and so has to be coordinated with deployments. And renaming/removing `Market`s is a breaking change.

So, unless if you have codepaths that are explicitly dedicated to `Market 1` codepath is "chunk of business logic" and `Market 2` codepath is "different chunk of business logic", these "small lookup tables" are generally better modeled as just regular entities.

## Native Enums

While Joist generally prefers enum tables, if you have native enums in your schema, Joist will work for those as well.

Note that you don't get enum details, or extra columns, but the basic out of "a TypeScript" enum and `Author.favoriteColor` is typed as the `Color` enum will work.
