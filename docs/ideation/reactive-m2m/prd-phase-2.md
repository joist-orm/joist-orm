# PRD Phase 2: Test Schema and Test Suite

## Overview

Create the test infrastructure including database schema, entity configuration, and comprehensive test suite modeled after `ReactiveReference.test.ts`.

## Rationale

Phase 2 validates the core implementation with real-world usage patterns. The `Author.bestReviews` example provides a concrete, testable use case that exercises all reactive collection features.

## User Stories

1. **As a developer**, I want comprehensive tests so that I can trust the ReactiveCollection implementation.

2. **As a maintainer**, I want tests that mirror existing patterns so that the test suite is consistent and maintainable.

## Functional Requirements

### FR-1: Database Schema

Create migration for `authors_to_best_reviews` join table:

```sql
CREATE TABLE authors_to_best_reviews (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  book_review_id INTEGER NOT NULL REFERENCES book_reviews(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(author_id, book_review_id)
);
```

**Requirements:**
- FR-1.1: Standard m2m join table structure
- FR-1.2: Foreign keys to `authors` and `book_reviews`
- FR-1.3: Unique constraint on the pair

### FR-2: Codegen Configuration

Configure `bestReviews` in `joist-config.json` with `derived: async`:

```json
{
  "entities": {
    "Author": {
      "relations": {
        "bestReviews": { "derived": "async" }
      }
    }
  }
}
```

**Requirements:**
- FR-2.1: Add `isReactiveCollection()` helper to `config.ts` (similar to `isReactiveReference()`)
- FR-2.2: Update codegen to recognize `derived: async` on m2m relations
- FR-2.3: Generate metadata with `derived: "async"` for ReactiveCollection fields
- FR-2.4: ReactionsManager recognizes ReactiveCollection as a reactable field

### FR-3: Entity Configuration

Configure `Author.bestReviews` ReactiveCollection:

```typescript
// In Author entity config
readonly bestReviews: ReactiveCollection<Author, BookReview> = hasReactiveCollection(
  "authors_to_best_reviews",
  "author_id",
  bookReviewMeta,
  "bestReviewAuthors",
  "book_review_id",
  "bestReviews",
  { books: { reviews: "rating" } },
  (author) => author.books.get.flatMap(b => b.reviews.get).filter(r => r.rating >= 5),
);
```

**Requirements:**
- FR-3.1: Declare on Author entity with proper types
- FR-3.2: Reactive hint covers `books.reviews.rating` path
- FR-3.3: Function filters reviews with rating >= 5

### FR-4: Test Suite

Create `ReactiveCollection.test.ts` covering:

**Loading Behavior:**
- FR-4.1: Can load collection explicitly via `.load()`
- FR-4.2: Can access via `.get` when hint is already loaded
- FR-4.3: Throws when accessing `.get` before loading
- FR-4.4: `fieldValue` returns materialized DB value without recalc

**Reactive Recalculation:**
- FR-4.5: Recalculates when rating changes (crosses threshold)
- FR-4.6: Recalculates when review is added
- FR-4.7: Recalculates when review is removed
- FR-4.8: Recalculates when book is added/removed from author

**Change Tracking:**
- FR-4.9: `changes.bestReviews.hasChanged` works correctly
- FR-4.10: `changes.bestReviews.hasUpdated` works correctly
- FR-4.11: Changes are flushed to join table

**Persistence:**
- FR-4.12: New join table rows created on flush
- FR-4.13: Old join table rows deleted on flush
- FR-4.14: Collection loads correctly from fresh EntityManager

**Edge Cases:**
- FR-4.15: Empty collection works correctly
- FR-4.16: Deleted entities filtered by default
- FR-4.17: `withDeleted: true` includes soft-deleted entities

## Non-Functional Requirements

- NFR-1: Tests must pass via `yarn test-stock` in integration package
- NFR-2: Test patterns should mirror `ReactiveReference.test.ts` for consistency
- NFR-3: Use `toMatchEntity` assertions per project conventions

## Dependencies

**Prerequisites:**
- Phase 1 complete (ReactiveCollection implementation)
- Existing test infrastructure (factories, test database)

**Outputs:**
- Database migration file
- Updated Author entity with `bestReviews` field
- `ReactiveCollection.test.ts` test file

## Acceptance Criteria

- [ ] Migration creates `authors_to_best_reviews` table
- [ ] `Author.bestReviews` is properly declared and typed
- [ ] All test scenarios in FR-3 have passing tests
- [ ] Tests run successfully via `yarn test-stock`
- [ ] Test file follows existing patterns from `ReactiveReference.test.ts`
