# Implementation Spec: Phase 2 - Test Schema and Test Suite

## Technical Approach

1. Add database migration for `authors_to_best_reviews` join table
2. Configure `Author.bestReviews` as a ReactiveCollection manually (no codegen)
3. Create comprehensive test suite following `ReactiveReference.test.ts` patterns

## File Changes

### Modified Files

#### `packages/tests/integration/migrations/1580658856631_author.ts`

Add at end of `up()` function (after existing m2m table creations):

```typescript
// For testing ReactiveCollection - a derived m2m between Author and BookReview
createManyToManyTable(b, "authors_to_best_reviews", "authors", "book_reviews");
```

#### `packages/tests/integration/src/entities/Author.ts`

Add imports:

```typescript
import {
  // ... existing imports
  hasReactiveCollection,
  ReactiveCollection,
} from "joist-orm";
import { BookReview, bookReviewMeta } from "./entities";
```

Add field declaration after `favoriteBook`:

```typescript
/** ReactiveCollection of all reviews with rating >= 5 across author's books. */
readonly bestReviews: ReactiveCollection<Author, BookReview> = hasReactiveCollection(
  "authors_to_best_reviews",
  "author_id",
  bookReviewMeta,
  "bestReviewAuthors",  // other side field name
  "book_review_id",
  "bestReviews",
  { books: { reviews: "rating" } },
  (a) => {
    return a.books.get
      .flatMap(b => b.reviews.get)
      .filter(r => r.rating >= 5);
  },
);

// Add to transientFields for test tracking
transientFields = {
  // ... existing fields
  bestReviewsCalcInvoked: 0,
};
```

Update transient fields tracking:

```typescript
readonly bestReviews: ReactiveCollection<Author, BookReview> = hasReactiveCollection(
  "authors_to_best_reviews",
  "author_id",
  bookReviewMeta,
  "bestReviewAuthors",
  "book_review_id",
  "bestReviews",
  { books: { reviews: "rating" } },
  (a) => {
    a.transientFields.bestReviewsCalcInvoked++;
    return a.books.get
      .flatMap(b => b.reviews.get)
      .filter(r => r.rating >= 5);
  },
);
```

#### `packages/tests/integration/src/entities/codegen/AuthorCodegen.ts`

Add to `AuthorFields` interface:

```typescript
bestReviews: { kind: "m2m"; type: BookReview };
```

Add to filter types:

```typescript
bestReviews?: EntityFilter<BookReview, BookReviewId, FilterOf<BookReview>, null>;
```

#### `packages/tests/integration/src/entities/codegen/metadata.ts`

Add to author metadata fields:

```typescript
"bestReviews": {
  kind: "m2m",
  fieldName: "bestReviews",
  fieldIdName: "bestReviewIds",
  required: false,
  otherMetadata: () => bookReviewMeta,
  otherFieldName: "bestReviewAuthors",
  serde: undefined,
  immutable: false,
  joinTableName: "authors_to_best_reviews",
  columnNames: ["author_id", "book_review_id"],
  derived: "async",  // Mark as derived
},
```

#### `packages/tests/integration/src/entities/BookReview.ts`

Add inverse side (can be a regular m2m since it's read-only from BookReview's perspective):

```typescript
// This is declared in codegen but we need the field to exist
// The actual collection is managed by the ReactiveCollection on Author
```

### New Files

#### `packages/tests/integration/src/relations/ReactiveCollection.test.ts`

```typescript
import {
  Author,
  Book,
  BookReview,
  newAuthor,
  newBook,
  newBookReview,
} from "@src/entities";
import {
  insertAuthor,
  insertBook,
  insertBookReview,
  select,
  insert,
} from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";

describe("ReactiveCollection", () => {
  describe("loading behavior", () => {
    it("can be accessed if implicitly loaded", async () => {
      const em = newEntityManager();
      // Given a new author with a book that has a 5-star review
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      // Then we can access bestReviews because the hint is in-memory
      expect(a.bestReviews.get).toMatchEntity([r]);
    });

    it("returns empty array for new author with no reviews", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      expect(a.bestReviews.get).toEqual([]);
    });

    it("filters reviews below threshold", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [
            { rating: 5 },  // included
            { rating: 4 },  // excluded
            { rating: 3 },  // excluded
          ],
        }],
      });
      const [b] = a.books.get;
      const reviews = b.reviews.get;
      expect(a.bestReviews.get).toMatchEntity([reviews[0]]);
    });

    it("throws when accessing get before loading", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      expect(() => a.bestReviews.get).toThrow("has not been loaded yet");
    });

    it("load populates the reactive hint", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      const reviews = await a.bestReviews.load();
      expect(reviews.length).toBe(1);
      expect(a.bestReviews.isLoaded).toBe(true);
    });
  });

  describe("reactive recalculation", () => {
    it("recalculates when rating changes across threshold", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 4 }],
        }],
      });
      await em.flush();

      // Initially not in bestReviews
      expect(a.bestReviews.get).toEqual([]);

      // Change rating to 5
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      r.rating = 5;

      // Now should be included
      expect(a.bestReviews.get).toMatchEntity([r]);
    });

    it("recalculates when review is added", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, { books: [{}] });
      await em.flush();

      expect(a.bestReviews.get).toEqual([]);

      // Add a 5-star review
      const [b] = a.books.get;
      const r = newBookReview(em, { book: b, rating: 5 });

      expect(a.bestReviews.get).toMatchEntity([r]);
    });

    it("recalculates when review is removed", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });
      await em.flush();

      const [b] = a.books.get;
      const [r] = b.reviews.get;
      expect(a.bestReviews.get).toMatchEntity([r]);

      // Delete the review
      em.delete(r);

      expect(a.bestReviews.get).toEqual([]);
    });

    it("recalculates when book is added to author", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      const b = newBook(em, { title: "b1", author: a, reviews: [{ rating: 5 }] });
      await em.flush();

      expect(a.bestReviews.get).toMatchEntity([b.reviews.get[0]]);
    });

    it("recalculates when book is removed from author", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });
      const a2 = newAuthor(em, {});
      await em.flush();

      const [b] = a1.books.get;
      expect(a1.bestReviews.get.length).toBe(1);

      // Move book to different author
      b.author.set(a2);

      expect(a1.bestReviews.get).toEqual([]);
    });
  });

  describe("change tracking", () => {
    it("tracks hasChanged correctly", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, { books: [{}] });
      await em.flush();

      // Initially not changed
      expect(a.changes.bestReviews.hasChanged).toBe(false);

      // Add a review
      const [b] = a.books.get;
      newBookReview(em, { book: b, rating: 5 });

      // Access to trigger recalc
      a.bestReviews.get;

      expect(a.changes.bestReviews.hasChanged).toBe(true);
    });
  });

  describe("persistence", () => {
    it("persists new join table rows on flush", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });
      await em.flush();

      // Check join table has the row
      const rows = await select("authors_to_best_reviews");
      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({
        author_id: 1,
        book_review_id: 1,
      });
    });

    it("deletes join table rows on flush when review drops below threshold", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });
      await em.flush();

      // Verify row exists
      let rows = await select("authors_to_best_reviews");
      expect(rows.length).toBe(1);

      // Drop rating below threshold
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      r.rating = 4;
      await em.flush();

      // Verify row deleted
      rows = await select("authors_to_best_reviews");
      expect(rows.length).toBe(0);
    });

    it("loads correctly from fresh EntityManager", async () => {
      // Setup data directly in DB
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      // Insert join table row
      await insert("authors_to_best_reviews", {
        author_id: 1,
        book_review_id: 1,
      });

      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      const reviews = await a.bestReviews.load();

      expect(reviews.length).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("handles empty collection correctly", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      expect(a.bestReviews.get).toEqual([]);
      expect(a.bestReviews.isLoaded).toBe(true);
      await em.flush();

      const rows = await select("authors_to_best_reviews");
      expect(rows.length).toBe(0);
    });

    it("filters deleted entities by default", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });
      await em.flush();

      const [b] = a.books.get;
      const [r] = b.reviews.get;
      expect(a.bestReviews.get).toMatchEntity([r]);

      // Soft-delete the review (if supported) or hard-delete
      em.delete(r);

      expect(a.bestReviews.get).toEqual([]);
    });

    it("includes deleted with withDeleted option", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });
      await em.flush();

      const [b] = a.books.get;
      const [r] = b.reviews.get;
      em.delete(r);

      expect(a.bestReviews.getWithDeleted).toMatchEntity([r]);
    });
  });

  describe("read-only enforcement", () => {
    it("throws on add()", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      const r = newBookReview(em, { rating: 5 });

      expect(() => (a.bestReviews as any).add(r)).toThrow("Cannot add");
    });

    it("throws on remove()", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });
      const [b] = a.books.get;
      const [r] = b.reviews.get;

      expect(() => (a.bestReviews as any).remove(r)).toThrow("Cannot remove");
    });

    it("throws on set()", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});

      expect(() => (a.bestReviews as any).set([])).toThrow("Cannot set");
    });

    it("throws on removeAll()", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});

      expect(() => (a.bestReviews as any).removeAll()).toThrow("Cannot removeAll");
    });
  });

  describe("caching", () => {
    it("caches calculation result", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });

      // Reset counter
      a.transientFields.bestReviewsCalcInvoked = 0;

      // First access
      a.bestReviews.get;
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(1);

      // Second access should use cache
      a.bestReviews.get;
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(1);
    });

    it("invalidates cache on dependency mutation", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{
          reviews: [{ rating: 5 }],
        }],
      });

      a.transientFields.bestReviewsCalcInvoked = 0;
      a.bestReviews.get;
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(1);

      // Mutate a dependency
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      r.rating = 4;

      // Should recalculate
      a.bestReviews.get;
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(2);
    });
  });

  describe("fieldValue", () => {
    it("returns materialized DB value without recalculation", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insert("authors_to_best_reviews", {
        author_id: 1,
        book_review_id: 1,
      });

      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      await a.bestReviews.load();

      // Change rating (would exclude from calculated value)
      const br = await em.load(BookReview, "br:1");
      br.rating = 1;

      // fieldValue should still show old materialized state
      // (this depends on implementation - may need adjustment)
      expect(a.bestReviews.fieldValue.length).toBe(1);
    });
  });
});
```

## Implementation Details

### Migration Pattern

Using existing `createManyToManyTable` utility from `joist-migration-utils`:

```typescript
createManyToManyTable(b, "authors_to_best_reviews", "authors", "book_reviews");
```

This creates:
- Table with `id`, `author_id`, `book_review_id`, `created_at`
- Foreign keys to both tables
- Unique constraint on the pair

### Entity Configuration

The `hasReactiveCollection` call needs all the m2m metadata:
- Join table name
- Column names for both sides
- Other entity metadata
- Reactive hint
- Calculation function

### Inverse Side

The inverse side (`BookReview.bestReviewAuthors`) can be:
1. A regular read-only collection populated from the join table
2. Not exposed at all (internal only)

For simplicity, we'll start without exposing the inverse.

### Test Helpers

May need to add insert helper:

```typescript
// In inserts.ts
export async function insertAuthorsToBestReviews(row: { author_id: number; book_review_id: number }) {
  return insert("authors_to_best_reviews", row);
}
```

## Testing Requirements

Run all tests:

```bash
cd packages/tests/integration
yarn test-stock -- ReactiveCollection
```

Verify no regressions:

```bash
yarn test-stock
```

## Error Handling

- Migration failures: Standard pg-migrate error handling
- Test failures: Jest assertions with `toMatchEntity` matcher

## Validation Commands

```bash
# Run migration
cd packages/tests/integration && yarn migrate

# Regenerate entities (if needed)
yarn joist-codegen

# Run tests
yarn test-stock -- ReactiveCollection

# Run full test suite
yarn test-stock
```
