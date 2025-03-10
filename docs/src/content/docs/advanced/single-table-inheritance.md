---
title: Single Table Inheritance
description: Documentation for Single Table Inheritance
---

Joist supports [Single Table Inheritance](https://www.martinfowler.com/eaaCatalog/singleTableInheritance.html), which allows inheritance/subtyping of entities (like `class Dog extends Animal`), by automatically mapping multiple logical polymorphic entities (`Dog`, `Cat`, and `Animal`) into a single physical SQL table (`animals`).

## Database Representation

For example, lets say we have a `Dog` entity and a `Cat` entity, and we want them to both extend the `Animal` entity.

For single table inheritance, we represent this in Postgres by having a single table: `animals`.

- The `animals` table has all columns for `Animal`s, `Dog`s, or `Cat`s
- A discriminator column, i.e. `type_id`, tells Joist whether a given row is a `Dog` or a `Cat`
  - We currently require the discriminator field to be an enum column
- Any `Dog`-only columns are configured in `joist-config.json`
- Any `Cat`-only columns are configured in `joist-config.json`
- Any `Dog`- or `Cat`-only columns must be nullable

The`joist-config.json` might look like:

```json
{
  "entities": {
    "Animal": {
      "fields": {
        "type": { "stiDiscriminator": { "DOG": "Dog", "CAT": "Cat" } },
        "canBark": { "stiType": "Dog" },
        "canMeow": { "stiType": "Cat", "notNull": true }
      },
      "tag": "a"
    },
    "DogPack": {
      "relations": {
        "leader": { "stiType": "Dog" }
      },
      "tag": "dp"
    }
  }
}
```

## Entity Representation

When `joist-codegen` sees the above `joist-config.json` setup, Joist will ensure that the `Dog` model extends the `Animal` model.

Note that because of the codegen entities, it will actually end up looking like:

```typescript
// in Dog.ts
class Dog extends DogCodegen {
   // any custom logic
}

// in DogCodegen.ts
abstract class DogCodegen extends Animal {
  can_bark: boolean;
}

// in Animal.ts
class Animal extends AnimalCodegen {
   // any custom logic
}

// in AnimalCodegen.ts
abstract class AnimalCodegen extends BaseEntity {
   name: string;
}
```

And when you load several `Animal`s, Joist will automatically read the `type_id` column and create the respective subtype:

```typescript
const [a1, a2] = await em.loadAll(Animal, ["a:1", "a:2"]);
// If a1 was saved as a dog, it will be a Dog
expect(a1).toBeInstanceOf(Dog);
// if a2 was saved as a cat, it will be a Cat
expect(a2).toBeInstanceOf(Cat);
```

## SubType Configuration

Due to STI's lack of schema-based encoding (see Pros/Cons section below), you may often need to manually configure the `joist-config.json` to give Joist hints about "which subtype" a given relation should be.

For example, instead of the `DogPack.leader` relation (from the `dog_packers.leader_id` FK) being typed as `Animal` (which is the `animals` table that the `leader_id` FK points to in the database schema), you want it to be typed as `Dog` because you know all `DogPack` leader's should be `Dog`s.

These hints in `joist-config.json` generally look like:

1. Adding an `stiDiscriminator` mapping to the `type` field that Joist will use to know "which subtype is this?"
2. Adding `stiType: "Dog"` or `stiType: "Cat"` to any field (like `canBark` or `canMeow`) in the `animals` table that should be limited to a specific subtype
   - The value of `"Dog"` or `"Cat"` should match a name in the `stiDiscriminator` mapping
   - Currently, we only support a field being in a single subtype
3. Adding `notNull: true` to any fields that you want Joist to enforce as not null
   - For example, if you want `canMewo` to be required for all `Cat`s, you can add `notNull: true` to the `canMeow` field
   - Without an explicit `notNull` set, we assume subtype fields are nullable, which is how they're represented in the database
   - See the "Pros/Cons" section later for why this can't be encoded in the database
4. On any FKs that point _to_ your base type, add `stiType: "SubType"` to indicate that the FK is only valid for the given subtype.
   - See the `DogPack` example in the above example config

## Tagged Ids

Currently, subtypes share the same tagged id as the base type.

For example, `dog1.id` returns `a:1` because the `Dog`'s base type is `Animal`, and all `Animal`s (regardless of whether they're `Dog`s or `Cat`s) use the `a` tag.

## Abstract Base Types

If you'd like to enforce that base type is abstract, i.e. that users cannot instantiate `Animal`, they must instantiate either a `Dog` or `Cat`, then you can mark `Animal` as `abstract` in the `joist-config.json` file:

```json
{
  "entities": {
    "Animal": {
      "tag": "a",
      "abstract": true
    }
  }
}
```

You also need to manually update the `Animal.ts` file to make the class `abstract`:

```typescript
export abstract class Animal extends AnimalCodegen {}
```

After this, Joist will enforce that all `Animal`s must be either `Dog`s or `Cat`s.

For example, if an `em.load(Animal, "a:1")` finds a row only in the `animals` table, and no matching row in the `dogs` or `cats` table, then the `em.load` method will fail with an error message.

## Pros/Cons to Single Table Inheritance

Between Single Table Inheritance (STI) and [Class Table Inheritance](./class-table-inheritance.md) (CTI), Joist generally recommends using CTI over STI for the following reasons:

1. With CTI, the database schema makes it obvious what the class hierarchy should be.

   Given the schema itself already has the per-type fields split out (into separate tables), there is very little configuration for CTI, and instead the generated entities are basically "automatically correct".

   With STI, this schema-based encoding does not exist, so we have to configure items like the discriminator value, and which fields belong to which subtype, in the `joist-config.json`. This is doable, but tedious.

2. With CTI, the schema is safer, because the subtype-only columns can have not-null constraints.

   With STI, if we want `can_bark` to be required for all `Dog`s, we cannot use a `can_bark boolean NOT NULL` in the schema, because the `animals` table will also have `Cat` rows that fundamentally don't have `can_bark` values.

   Instead, we have to indicate in `joist-config.json` that Joist should enforce model-level not-null constraints, which is okay, but not as good as database-level enforcement.

3. With CTI, we can have foreign keys point directly to subtypes.

   For example, we could have a `DogPack` entity with a `dog_packs.leader_id` foreign key that references the `dogs` subtype table, and so points _only_ to `Dog`s, and is fundamentally unable to point to `Cat`s (even at the database level, this is enforced b/c the `dogs` table will not have any ids of `Cat` entities).

   With STI, it's not possible in the database to represent/enforce that FKs are only valid for a specific subtype (`dog_packs.leader_id` can only point to the `animals` table).

That said, the pro of STI is that you don't need `LEFT OUTER JOIN`s to load entities (see the [CTI](./class-table-inheritance.md) docs), b/c all data for all subtypes is a single table.

## When to Choose STI/CTI

To application code, the STI and CTI approach can look near identical, because both approaches result in the same `Dog`, `Cat`, and `Animal` type hierarchy.

But, generally Joist recommends:

- Use CTI when the polymorphism is an integral part of your domain model, i.e. you have "true" `Cat` and `Dog` entities as separate concepts you want to model in your domain
- Use STI when the polymorphism is for a transient implementation detail, i.e. migrating your `Cat` model to a `CatV2` model.

And, either way, use both approaches judiciously; in a system of 50-100 entities, you should probably be using CTI/STI only a handful of times.
