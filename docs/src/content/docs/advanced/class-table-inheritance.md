---
title: Class Table Inheritance
description: Documentation for Class Table Inheritance
---

Joist supports [Class Table Inheritance](https://www.martinfowler.com/eaaCatalog/classTableInheritance.html), which allows inheritance/subtyping of entities (like `class Dog extends Animal`), by automatically mapping single/logical polymorphic entities across separate per-subtype/physical SQL tables.

## Database Representation

For example, lets say we have a `Dog` entity and a `Cat` entity, and we want them to both extend the `Animal` entity.

For class table inheritance, we represent this in Postgres by having three separate tables: `animals`, `dogs`, and `cats`.

* The `animals` table has an `id` primary key, with the usual auto increment behavior, and any fields that are common to all `Animal`s
* The `dogs` table also has an `id` primary key, but it does _not_ auto-increment, and is instead a foreign key to `animals.id`, and has any fields that are unique to the `Dog` entity
* The `cats` table also has an `id` primary key, again it does _not_ auto-increment, and is instead a foreign key to `animals.id`, and has any fields that are unique to the `Cat` entity

If you're using Joist's `migration-utils`, this might look like:

```typescript
createEntityTable(b, "animals", {
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

When `joist-codegen` sees that `dogs.id` is actually a foreign key to `animals.id`, Joist will ensure that the `Dog` model extends the `Animal` model.

Note that because of the codegen entities, which contain the getter/setter boilerplate, it will actually end up looking like:

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
abstract class DogCodegen extends Animal {
  can_bark: boolean;
}

// in Dog.ts
class Dog extends DogCodegen {
  // any custom logic
}
```

And when you load several `Animal`s, Joist will automatically probe the `dogs` and `cats` tables (by using a `LEFT OUTER JOIN` to each subtype table) and create entities of the right type:

```typescript
const [a1, a2] = await em.loadAll(Animal, ["a:1", "a:2"]);
// If a1 was saved as a dog, it will be a Dog
expect(a1).toBeInstanceOf(Dog);
// if a2 was saved as a cit, it will be a Cat
expect(a2).toBeInstanceOf(Cat);
``` 

Similarly, if you save a `Dog` entity, Joist will automatically split the entity's data across both tables, putting the `name` into `animals` and `can_bark` into `dogs`, with the same `id` value for both rows:

```typescript
const dog = em.create(Dog, {
  name: "doge",
  can_bark: true,
});
// Generates both `INSERT INTO animals ...` and
// `INSERT INTO dogs ...`.
await em.flush();
```

## Tagged Ids

Currently, subtypes share the same tagged id as the base type.

For example, `dog1.id` returns `a:1` because the `Dog`'s base type is `Animal`, and all `Animal`s (regardless of whether they're `Dog`s or `Cat`s) use the `a` tag.

Joist might someday support per-subtype tags, but it would be complicated b/c we don't always know the subtype of an id; e.g. if there is a `pet_owners.animal_id` foreign key, and it points to either `Dog`s or `Cat`s, when loading the row `PetOwner:123` it's impossible to know if the tagged id its `animal_id` value should be `d:1` or `c:1` without first probing the `dogs` and `cats` tables, which takes extra SQL calls to do. So for now it's simplest/most straightforward to just share the same tag across the subtypes.

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

## SubType Configuration

In some situations a subtype may want to override the behavior of a field or relation it inherits from its base type.  In such situations you may manually configure the `joist-config.json` for the subtype to give Joist hints about "which subtype" a given relation should be or about its nullability.

For example, instead of the `Dog.breed` relation (from the `animals.breed_id` FK) being typed as `Breed`, you want it to be typed as `DogBreed` because you know a `Dog` can't be a Maine Coon.

These hints in `joist-config.json` generally look like:

1. Adding `subType: "DogBreed"` to the `breed` relation in the `Dog` section of `joist-config.json` so that dogs can only be breeds of their species
   - The value of `"DogBreed"` or `"CatBreed"` should match a subclass
   - Currently, we only support a relation being a single subtype
2. Adding `notNull: true` to any fields or relations that you want Joist to enforce as not null
    - For example, if you want `breed` to be required for all `Dog`s but not `Cats`s, you can add `notNull: true` to the `breed` relation on `Dog`


## But Isn't Inheritance Bad Design?

Yes, inheritance can be abused, particularly with deep inheritance hierarchies and/or just bad design decisions.

But when you have a situation that fits it well, it can be an appropriate/valid way to design a schema, at your own choice/discretion.

If it helps, inheritance can also be thought of Abstract Data Types, which as a design pattern is generally considered a modern/good approach for accurately & type-safely modeling values that have different fields based on their current kind/type.

ADTs also focus just on the per-kind/per-type data attributes, and less on the polymorphic behavior of methods encoded/implemented within the class hierarchy which was the focus of traditional OO-based inheritance.

When using inheritance with Joist entities, you can pick whichever approach you prefer: either more "just data" ADT-ish inheritance or "implementation-hiding methods" OO-ish inheritance.
