---
title: Class Table Inheritance
sidebar_position: 6
---

Joist supports [Class Table Inheritance](https://www.martinfowler.com/eaaCatalog/classTableInheritance.html), which allows inheritance/subtyping of entities, and automatically handling the mapping of polymorphic entities to the right physical SQL tables.

## Database Representation

For example, lets pretend we have `Dog` entities and `Cat` entities, and we want them to both extend the `Animal` entity.

For class table inheritance, we represent this in Postgres by having three separate tables: `animals`, `dogs`, and `cats`.

* The `animals` table has an `id` primary key, with the usual auto increment behavior, and any fields that are common to all `Animal`s
* The `dogs` table also has an `id` primary key, but it does _not_ auto-increment, and is instead a foreign key to `animals.id`, and has any fields that are unique to the `Dog` entity
* The `cats` table also has an `id` primary key, again it does _not_ auto-increment, and is instead a foreign key to `animals.id`, and has any fields that are unique to the `Cat` entity

If you're using Joist's `migration-utils`, this might look like:

```typescript
createEnumTable(b, "animals", {
  name: "text",
})
createSubTable(b, "animals", "dogs", {
  can_bark: "boolean",
});
createSubTable(b, "animals", "cats", {
  can_meow: "boolean",
});
```

## Entity Representation

When `joist-codegen` sees that `dogs.id` is actually a foreign key to `animals.id`, it will create TypeScript output where the `Dog` class extends the `Animal` class.

Note that because of the "codegen" entities, it will actually end up looking like:

```typescript
// in AnimalCodegen.ts
abstract class AnimalCodegen extends BaseEntity {
  name: string;
}

// in Animal.ts
class Animal extends AnimalCodegen {
  // any custom logic
}

// in DogCodegen.ts
abstract class DogCodegen extends Dog {
  can_bark: boolean;
}

// in Dog.ts
class Dog extends DogCodegen {
  // any custom logic
}
```

Now, when you load several `Animal`s, Joist will automatically probe the `dogs` and `cats` tables and create entities of the right type:

```typescript
const [a1, a2] = await em.loadAll(Animal, ["a:1", "a:2"]);
// If a1 was saved as a dog, it will be a Dog
expect(a1).toBeInstanceOf(Dog);
// if a2 was saved as a cit, it will be a Cat
expect(a2).toBeInstanceOf(Cat);
``` 

Similarly, if you save a `Dog`, Joist will automatically handle inserting the entity into both tables, putting the `name` into `animals` and `can_bark` into `dogs`, with the same `id` value for both rows:

```typescript
const dog = em.create(Dog, {
  name: "doge",
  can_bark: true,
});
// Generates both `INSERT INTO animals ...` and
// `INSERT INTO dogs ...`.
await em.flush();
```

## What about Single Table Inheritance?

An alternative to Class Table Inheritance (CTI) is [Single Table Inheritance](https://www.martinfowler.com/eaaCatalog/singleTableInheritance.html) (STI), where `Dog`s and `Cat`s don't have their own tables, but have their subtype-specific fields stored directly on the `animals` table.

Joist currently does not support STI, generally because CTI has two pros:

1. With CTI, the database schema makes it obvious what the class hierarchy should be.

   Given how schema-driven Joist's `joist-codegen` is, it's very convenient to have the per-type fields already split out (into separate tables) and then to use the `id` foreign keys to see the "extends" relationships.

   With STI, this sort of "obvious" visibility does not exist, and we'd have to encode the type hierarchy in `joist-config.json`, i.e. some sort of mapping that says `animals.can_bark` is only applicable for the `Dog` subtype, and `animals.can_meow` is only applicable for the `Cat` subtype.

2. With CTI, the schema is safer, because the subtype-only columns can have not-null constraints.

   With STI, even if `can_bark` is required for all `Dog`s, because there will be `Cat` rows in the `animals` table that just fundamentally cannot have a `can_bark` value, the column must be nullable.

   Which is fine if it's already nullable, but if you wanted it to be non-null, now we have to encode in `joist-config.json` that it is _technically_ required, and rely on Joist's runtime code to enforce it.

3. With CTI, we can have foreign keys directly to subtypes.

   For example, we could have a `DogCollar` entity that had a `dog_collars.dog_id` foreign key that points _only_ to `dogs`, and is fundamentally unable to point to `Cat`s.

   With STI, it's not possible in the database to represent/enforce that FKs are only valid for a specific subtype.

That said, the pro of STI is that you don't need `JOIN`s to load entities, b/c all the database is in one table, so Joist could likely support STI someday, it just does not currently.

## But Isn't Inheritance Bad Design?

Yes, inheritance can be abused, particularly with deep inheritance hierarchies and/or just "bad design".

But when you have a situation that fits it well, it can be an appropriate/valid way to design a schema, at your own choice/discretion.

If it helps, inheritance can also be thought of Abstract Data Types, which as a design pattern is generally considered a modern/"good" approach for accurately & type-safely modeling values that have different fields based on their current kind/type.

ADTs also focus just on the per-kind/per-type data attributes, and less on the polymorphic behavior of methods encoded/implemented within the class hierarchy which was the focus of traditional OO-based inheritance.

When using inheritance with Joist entities, you can pick whichever approach you prefer: either more "just data" ADT-ish inheritance or "implementation-hiding methods" OO-ish inheritance.


