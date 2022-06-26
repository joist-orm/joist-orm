---
title: Polymorphic References
sidebar_position: 6
---

Joist's polymorphic references enable modeling an entity (i.e. Book) that has a single field (i.e. a reference) that can be set to multiple (i.e. poly) types of other entities, but only 1 such entity at a time.

For example maybe a `Book` has a `publisher` that can either be a `CorporatePublisher` entity (a row in the `corporate_publishers` table) or a `SelfPublisher` entity (a row in the `self_publishers` table).

### Implementation

Polymorphic references have two components:

- In the domain model, they are a single logical field (i.e. `Book.publisher`).

  The field type is `PolymorphicReference<BookPublisher>`, where `BookPublisher` is a codegen'd type union of the each potential type, i.e. Joist will create:

  ```typescript
   export type BookPublisher = CorporatePublisher | SelfPublisher;
  ```

  In the `BookCodegen.ts` file.

- In the database schema, they are multiple physical columns, one per "other" entity type (i.e. `books.publisher_corporate_publisher_id` and `books.publisher_self_publisher_id`)

### Usage

To use polymorphic references, there are two steps:

1. Create 

In 
  "Comment": { "relations": { "parent": { "polymorphic": "notNull" } }, "tag": "comment" },

- Logically in the domain model, they

### Limitations

