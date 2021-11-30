---
title: Relation Helpers
---

### hasOneThrough

You can define common paths through your entity graph with `hasOneThrough`:

```typescript
export class BookReview extends BookReviewCodegen {
  readonly author: Reference<BookReview, Author, never> = hasOneThrough((review) => review.book.author);
}
```

The `hasOneThrough` DSL is built on Joist's `CustomReferences`, so will also work with `populate`, i.e.:

```typescript
const review = await em.load(BookReview, "1", { author: "publisher" });
expect(review.author.get.publisher.get.name).toEqual("p1");
```

### hasOneDerived

You can define a relation that is conditional with `hasOneDerived`:

```typescript
readonly publisher: Reference<BookReview, Publisher, undefined> = hasOneDerived(
  { book: { author: "publisher" } },
  (review) => {
    // some conditional logic here, but review is loaded
    return review.book.get.author.get.publisher.get
  },
);
```

This works a lot like `hasOneThrough`, but if useful for when you have conditional navigation logic, instead of a fixed navigation path.
