---
title: Lifecycle Hooks
sidebar_position: 6
---

Joist supports hooks that can run business logic at varies stages in an entity's lifecycle, for example to implement business logic like "when an `Author` entity is updated, always do x/y/z".

Hooks are not immediately ran on `em.create` or entity modifications, and only run as part of `em.flush()` because `em.flush()` is an async method, and this allows hooks to themselves have async behavior, i.e. load additional entities from the database.

### Setup

All hooks are set up by the entity's `config` API:

```typescript
import { authorConfig as config } from "./entities";

export class Author extends AuthorCodegen {}

// Create a draft book for all authors
config.beforeCreate("books", (a, { em }) => {
  if (a.books.get.length === 0) {
    em.create(Book, { author: a, status: BookStatus.Draft });
  }
});
```

:::info

At first, it seems odd that Joist's hooks are not methods on the class itself, as this would be a more traditional place for ORM-driven business logic.

However, being added via the `config` API has a few benefits:

1. The hook methods all take load hints, i.e. `"books"` in the above `beforeCreate` example, which makes the `a` param typed as `Loaded<Author, "books">` instead of `Author`.

   This allows the hook's business logic to be written with as few `await`s as possible, such that ideally the lambda itself can be synchronous (although you can make it `async` if necessary).

   If `beforeCreate` was written as a method, then an additional local variable (similar to `a`) would need to be created, as `this` is not aware of the hook's load hint.

2. It's easier to keep business logic small & decoupled, because if you have multiple operations to perform on `beforeCreate`, you can have two entirely separate hooks, each with separate load hints and their own lambdas.

   If `beforeCreate` was a single `Author.beforeCreate` method, then its implementation would just get bigger and more complex as it handles additional business requirements.

3. It's trivial to reuse hook logic across entities without relying on multiple inheritance.

   For example, we could have a method like `addSoftDeleteHooks(config)` that, for any given entity's config, adds some shared business logic to the entity.

:::

### Available Hooks

Joist supports the following hooks, listed in the order that they are fired during `em.flush`:

- `beforeCreate` fired when an entity is created / `INSERT`-d for the first time
- `beforeUpdate` fired when an entity is updated / `UPDATE`-d
- `beforeFlush` fired when an entity is either created or updated (but not deleted)
- `beforeDelete` fired when an entity is deleted / `DELETE`-d
- `afterValidation` fired after an entity is created or updated, and all validation rules have passed
- `beforeCommit` fired when an entity is created, or updated, or deleted and the transaction is about to commit, can abort the transaction by throwing an error
- `afterCommit` fired when an entity is created, or updated, or deleted and the transaction has committed

### Allowed Behavior

`beforeCreate`, `beforeUpdate`, `beforeFlush`, and `beforeDelete` hooks are allowed to create/update/delete other entities.

For example, a new `Author` can use a `beforeCreate` hook to automatically `em.create` the author's first/default `Book`. Or a deleted `Author` could `em.delete` its `Book`s in an `Author.beforeDelete` hook (Joist also has a dedicated `config.cascadeDelete` API, but `beforeDelete` can handle more custom behavior).

Any entities that are created/updated/deleted by a hook will themselves have their appropriate hooks ran, although only if those entity's hooks have not already been run (to avoid cycles of a book-touches-author/author-touches-book infinitely recursing).

`afterValidation`, `beforeCommit`, and `afterCommit` are not allowed to mutate entities.

#### Wire Calls

Making RPC calls to 3rd party systems can be problematic, and so we recommend:

- Do not make RPC calls from any non-`afterCommit` hook.

  It is very likely that hooks (like `beforeFlush`) will run, but then your `em.flush` later fails due to validation rules, at which point your transaction/changes won't be committed, and you've likely made an unnecessary/incorrect wire call.

- Only pragmatically make wire calls in the `afterCommit` hook.

  While `afterCommit` is the "safest" place to make a wire call, because it's only called after the transaction has been committed, there is still a chance that either a) `em.flush` commits but the machine crashes before running `afterCommit`, or b) your `afterCommit` fails but now will not retry.

Because of these wrinkles, our best advice is to use the [job drain](https://brandur.org/job-drain) pattern, and use a `beforeCommit` hook to transactionally enqueue jobs in your primary database.

The `beforeCommit` hook runs after entities have been `INSERT`d or `UPDATE`d, and so will have access to entity ids, which can be used for background job parameters/payloads. 

These background jobs create "intentions of work to be done", and since the job is atomically saved to the database in the same transaction as your business logic writes (for example inserting a `sendOnboardingEmail` job into the `jobs` table and `INSERT`ing a new `authors` row), they are both guaranteed to complete or not-complete. And then the background job runner can separately invoke (and retry if necessary) the intended action of calling/syncing with the 3rd party system.

### Hooks vs. Validation Rules

Hooks run before validation rules, and are allowed to mutate entities that may currently be invalid.

Validation rules run after hooks, and are not allowed to mutate entities: they must be side effect free.

For example, you could have a validation rule of "Author must have at least one book", and a hook that "creates a default book for new authors", and when you do `em.create(Author)` without any books, then first the hook would run and create a single book, such that when the validation rule runs, it passes.

Similarly, hooks can set required fields before the missing values trigger validation rules.

Validation rules are only ran once per `em.flush`, and only after all hooks, and all transitively-ran hooks, have finished.

:::info

The term "transitively-ran" hooks describes the scenario of:

- An endpoint/user code creates 5 new `Author` entities and calls `em.flush`
- `em.flush` "runs hooks" (`beforeCreate` and `beforeFlush`) for all 5 new `Author`s entities
- Each `Author`'s `beforeCreate` hook creates a new draft `Book` entity
- `em.flush` notices the newly-created `Book` entities, and so "runs hooks again", but only against the 5 `Book` entities

So, this process is transitive as mutating the initial set of entities may cause, via custom logic in hooks, a subsequent set of entities to be mutated, which themselves might cause an additional set of entities to be mutated, until the process "settles".

Note that because `em.flush` marks which entities have had hooks ran, and will not invoke hooks twice on a given entity, this process is guaranteed to finish, i.e. there is not a risk of infinite loops between hooks.

:::

## afterMetadata

`afterMetadata` is an additional hook that is not associated with an entity's lifecycle, but instead called once during the boot process.

This can be useful if you want to set up hooks for multiple entities, but need to make sure all entity constructors have been defined (which happens incrementally during the `import` / `require` process).

For example, if you're using polymorphic references and want to setup a hook for each entity in the union:

```typescript
/** Add rules to each of our polymorphic entities. */
config.afterMetadata(() => {
  getParentConstructors().forEach((cstr) => {
    // Get each entity's config and add a hook
    getMetadata(cstr).config.beforeCreate((e) => {});
  });
});
```
