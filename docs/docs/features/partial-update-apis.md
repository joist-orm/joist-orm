### Support for Partial Update Style APIs

A common pattern for APIs is to treat `null` and `undefined` differently, i.e. `{ lastName: null }` specifically means "unset the `lastName` property" while `firstName` being not present (i.e. `undefined`) means "do not change `firstName`".

These APIs can be difficult to map to Joist's opinionated approach of "required properties must never be passed as `null` or `undefined`", so Joist has two helper methods for building partial-update-style APIs: `EntityMangaer.createPartial` and `Entity.setPartial`.

I.e. for a non-null `firstName` and nullable `lastName` fields that both come in (from an RPC call or GraphQL mutation) as the "partial update" type of `string | null | undefined`, `Author.setPartial` allows directly passing both fields:

```typescript
const author = em.load(Author, "1");
const firstName: string | null | undefined = incomingFirstName;
const lastName: string | null | undefined = incomingLastName;
// Calling set is a compile error because set's firstName must be a string
// @ts-expect-error
author.set({ firstName, lastName });
// Call setPartial will compile
author.setPartial({ firstName, lastName });
}
```

And the runtime behavior is:

- `firstName: "foo"` will update `firstName`
- `firstName: undefined` will noop
- `firstName: null` will be a runtime error
- `lastName: "bar"` will update `lastName`
- `lastName: undefined` will noop
- `lastName: null` will unset `lastName` (i.e. set it as `undefined`)

The `EntityManager.createPartial` constructor method has similar semantics.

Arguably the ideal partial-update type for `Author` in this scenario would be:

```typescript
interface AuthorInput {
  firstName: string | undefined;
  lastName: string | null | undefined;
}
```

Which would alleviate the need for `setPartial`, but it's sometimes hard to express this nuance in RPC/API type systems that generate the `AuthorInput` TypeScript type, i.e. in particular GraphQL's type system cannot express the difference between `firstName` and `lastName` with a partial-update style input type like:

```graphql
type AuthorInput {
  firstName: String
  lastName: String
}
```

There is also a `EntityManager.createOrUpdatePartial` method that will conditionally create-or-update an entity, while accepting partial-update/"`null`-means-unset" opts (and, per above, still apply runtime validation that no required fields are unset):

```typescript
// Partial-update-typed variables from incoming API call
const id: number | undefined | null = 0;
const firstName: string | undefined | null = "...fromApi...";
const mentorId: number | undefined | null = 1;
const newBooks: Array<{ title: string | undefined | null }> = [{ title: "...fromApi..." }];
await em.createOrUpdatePartial(Author, {
  id,
  firstName,
  mentor: mentorId,
  books: newBooks,
});
```

Note how, unlike the `create` and `set` methods that are synchronous and so only accept `Entity` values for opts like `mentor` and `books`, `createOrUpdatePartial` accepts partials of references/collections and will recursively `createOrUpdatePartial` nested partials into the appropriate new-or-found entities based on the presence of `id` fields.

This effectively mimicks Objection.js's [`upsertGraph`](https://vincit.github.io/objection.js/guide/query-examples.html#graph-upserts), with the same disclaimer that you should only pass trusted/white-listed keys to `createOrUpdatePartial` (i.e. keys from a validated/subset GraphQL input type) and not just whatever form fields the user has happened to HTTP POST to your endpoint.
