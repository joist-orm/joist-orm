---
title: Validation Rules
sidebar_position: 3
---

Entities can have validation rules that are run during `EntityManager.flush()`:

```typescript
import { authorConfig as config } from "./entities";

class Author extends AuthorCodegen {}

// Rules are added by calls to config.addRule
config.addRule((author) => {
  if (author.firstName && author.firstName === author.lastName) {
    return "firstName and lastName must be different";
  }
});

// Rules can be also async
config.addRule(async (author) => {
  // Note: As-is this rule will not re-run whenever our has has a new book;
  // see the next section on "Reactive Validation Rules" for how to fix this
  const books = await author.books.load();
  if (books.length === 0) {
    return "Must have at least one book";
  }
});
```

If any validation rule returns a `string`, i.e. an error message, then `flush()` will throw a `ValidationErrors` error and not issue any `INSERT`s or `UPDATE`s to the database for any entity changed in the current `EntityManager`.

:::tip

If you would like to skip validation rules, you can pass `skipValidation: true` to `flush()`. Use this technique with caution, as it can create invalid entities.

:::

:::info

Joist's API of calling `config.addRule` is non-traditional in that validation rules "live outside the entity", i.e. they are not inside a `validate()` method on the `Author` class.

This setup is intentional, because in the next section, it allows Joist to use reactive validation hints to discover when rules should run (i.e. when `Book.title` changes, re-run this specific `Author` validation rule), even if main entity (`Author`) hasn't been loaded from the database yet (or potentially the `Author` class has not even been instantiated yet).

See [Issues 198](https://github.com/stephenh/joist-ts/issues/198) for tracking ideas around this.

:::

## Reactive Validation Rules

Validation rules can also use a reactive hint (similar to Joist's load hints) to run cross-entity validation logic.

The reactive hints include which fields the rule needs to read, and then Joist will **automatically invoke the rule** whenever any field in the hint changes, even if it's on another entity (i.e. `Book.title`), and the rule's main entity (i.e. `Author`) hasn't been loaded from the database yet.

For example this rule:

```typescript
// Example of reactive rule being fired on Book change
config.addRule({ books: ["title"], firstName: {} }, async (a) => {
  if (a.books.get.length > 0 && a.books.get.find((b) => b.title === a.firstName)) {
    return "A book title cannot be the author's firstName";
  }
});
```

If your database has five entities:

- `Author:1 firstName=a1`
- `Author:2 firstName=a2`
- `Book:1 title=b1 author=Author:1`
- `Book:2 title=b2 author=Author:1`
- `Book:3 title=b3 author=Author:2`

Anytime `Book:1` or `Book:2` have their `title` changed, Joist will automatically load `Author:1` and re-run the validation rule.

To ensure validation rules only access fields that their hint declares, the lambda is passed a special `Reacted<Author, { books: "title", firstName: {}}` mapped type that only allows access to the `title` and `firstName` fields.

### Reactive Hints

Reactive hints can be either a single field name, an array of field names, or a nested hash.

For example, reactive hints on an `Author` might be:

- `"firstName"` - run whenever our `firstName` field changes
- `["firstName", "lastName"]` - run whenever our `firstName` or `lastName` fields change
- `{ books: "title" }` - run whenever any of our books' `title`s change
- `{ books: { title: {}, reviews: "rating" }` - run whenever any of our books' `title`s change, or any of our books' reviews' `rating`s change
  - This is an example of, when you want a nested hint for both a child/parent and as well as field, we use `title: {}` as a "nested hint" even though the `title` is itself a terminal hint.

And reactive hints on a `Book` might be

- `{ author: "firstName" }` - run whenever our author's `firstName` changes
- `{ author: ["firstName", "lastName" }` - run whenever our author's `firstName` or `lastName` changes

:::tip

If your validation rules needs to access a field, without causing reactivity to it, you can use a `:ro` or `_ro` suffix in the field name. For example:

```typescript
// Example of using firstName for the error message, so not needing to react on it
config.addRule(["books", "firstName:ro"], (a) => {
  if (a.books.get.length === 13) {
    return `Author ${a.firstName} cannot have 13 books`;
  }
});
```

:::

## Built-in Rules

### Required Fields

Joist's `joist-codegen` automatically adds required rules to any column with a not null constraint.

For example, in the `AuthorCodegen.ts` base class, `joist-codegen` automatically adds the lines:

```typescript
authorConfig.addRule(newRequiredRule("firstName"));
authorConfig.addRule(newRequiredRule("initials"));
authorConfig.addRule(newRequiredRule("numberOfBooks"));
authorConfig.addRule(newRequiredRule("createdAt"));
authorConfig.addRule(newRequiredRule("updatedAt"));
```

### Cannot Be Updated

If a field can only be set on create (i.e. a "parent"), you can use `cannotBeUpdated`:

```typescript
// Don't let the parent change
config.addRule(cannotBeUpdated("parent"));
```

Also, you can make this conditional, i.e. on a status:

```typescript
// Only allow updating cost while draft
config.addRule(cannotBeUpdated("cost", (e) => e.isDraft));
```

## Database Constraints

Generally, Joist prefers implementing domain model validation rules in TypeScript code, where rules are easier to write and test than if written as SQL triggers/stored procedures/etc.

That said, some rules like unique constraints are best enforced by the database, which is great, but their errors can cryptic, and not error messages you want shown to users, e.g.:

```
INSERT INTO "authors" (...) VALUES (...) - duplicate key value violates
 unique constraint "authors_publisher_id_unique_index"
```

Joist has basic support for recognizing "a constraint of the given name failed" and mapping that to a pretty error message, for example in `Author.ts` you could configure failures on the `authors_name_unique_index`:

```typescript
// Convert unique(name) to a validation error
config.addConstraintMessage("authors_name_unique_index", "There is already an Author with that name");
```

Note that the error message must be hard-coded, because when the database fails a unique constraint, Joist can't easily tell which specific entity is causing the error (e.g. we may be saving 5 authors, and only the 4th one caused the failure).
