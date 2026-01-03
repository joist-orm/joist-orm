# PRD Phase 3: ReactiveCollection Other Side

## Overview

Handle the "other side" of reactive m2m collections. When `Author.bestReviews` is a `ReactiveCollection` (controlling side), `BookReview.bestReviewAuthors` must be a read-only collection that reflects what the controlling side has written.

## Rationale

M2M relations are inherently two-sided. When one side (`Author.bestReviews`) is derived and controls the join table, the other side (`BookReview.bestReviewAuthors`) cannot allow mutations - they would conflict with the derived behavior. The other side needs special treatment:
- Read-only to prevent conflicts
- Auto-generated (no manual declaration needed)
- Reflects pending changes from the controlling side
- Participates in change tracking

## User Stories

1. **As a developer**, I want the other side of a reactive m2m to be automatically read-only so that I cannot accidentally create conflicting mutations.

2. **As a developer**, I want the other side to reflect pending (unflushed) changes from the controlling side so that I have a consistent view of the relationship.

3. **As a developer**, I want the other side to be auto-generated in the Codegen file so that I don't have to manually declare it.

4. **As a developer**, I want `entity.changes.otherSideField` to work so that I can detect when the relationship has changed.

## Functional Requirements

### FR-1: Metadata Auto-Detection

**Requirements:**
- FR-1.1: When codegen encounters m2m where one side has `derived: "async"` in joist-config.json, automatically mark the other side as `derived: "otherSide"`
- FR-1.2: Add `"otherSide"` as valid value for `ManyToManyField.derived` in `EntityDbMetadata.ts`
- FR-1.3: Add `"otherSide"` as valid value for `ManyToManyField.derived` in `EntityMetadata.ts` (runtime)
- FR-1.4: Store reference to the controlling side's entity/field for cross-lookup

### FR-2: ReactiveCollectionOtherSide Implementation

**Requirements:**
- FR-2.1: Create `ReactiveCollectionOtherSideImpl` class implementing read-only `Collection` interface
- FR-2.2: `add()`, `remove()`, `set()`, `removeAll()` throw errors (read-only)
- FR-2.3: `load()` reads current join table rows (same as regular m2m)
- FR-2.4: `get` returns entities including pending adds from controlling side
- FR-2.5: `get` excludes entities pending removal from controlling side
- FR-2.6: Must work without needing the controlling side loaded

### FR-3: hasReactiveCollectionOtherSide Factory

**Requirements:**
- FR-3.1: Create `hasReactiveCollectionOtherSide()` factory function
- FR-3.2: Accept join table metadata (same params as `hasManyToMany`)
- FR-3.3: Accept reference to controlling side (entity type + field name)
- FR-3.4: Return lazy field that creates `ReactiveCollectionOtherSideImpl`

### FR-4: Codegen Integration

**Requirements:**
- FR-4.1: `generateEntityCodegenFile.ts` generates `hasReactiveCollectionOtherSide()` for `derived: "otherSide"` fields
- FR-4.2: Generated type should be `ReadOnlyCollection<T, U>` or similar (not mutable `Collection`)
- FR-4.3: Field should NOT appear in entity opts types (read-only)
- FR-4.4: Field should NOT appear in optIds types (read-only)
- FR-4.5: Field SHOULD appear in filter types (can still filter by it)

### FR-5: Pending Changes Visibility

**Requirements:**
- FR-5.1: When controlling side has pending add, other side's `get` includes the entity
- FR-5.2: When controlling side has pending remove, other side's `get` excludes the entity
- FR-5.3: Use existing `JoinRows` infrastructure to read pending changes
- FR-5.4: After `em.flush()`, pending changes become committed state

### FR-6: Changes API Integration

**Requirements:**
- FR-6.1: `entity.changes.otherSideField.hasChanged` returns true when relationship modified
- FR-6.2: `entity.changes.otherSideField.hasUpdated` works correctly
- FR-6.3: Integrate with `configure.ts` reactive field tracking for `derived: "otherSide"`

## Non-Functional Requirements

- NFR-1: Performance should be comparable to regular `ManyToManyCollection` for loading
- NFR-2: Must not break existing `ReactiveCollection` (controlling side) functionality
- NFR-3: TypeScript types must clearly indicate read-only nature

## Dependencies

**Prerequisites:**
- Phase 1 & 2 complete (ReactiveCollection core + tests)
- Existing `JoinRows` infrastructure for pending change tracking

**Outputs:**
- `ReactiveCollectionOtherSideImpl` class
- `hasReactiveCollectionOtherSide()` factory
- Updated codegen for auto-detection and generation
- Updated metadata types

## Acceptance Criteria

- [ ] When `Author.bestReviews` is `derived: "async"`, `BookReview.bestReviewAuthors` is automatically `derived: "otherSide"`
- [ ] `bestReviewAuthors.add()` throws "Cannot add to read-only collection"
- [ ] `bestReviewAuthors.get` includes Authors with pending adds on `author.bestReviews`
- [ ] `bestReviewAuthors.get` excludes Authors with pending removes on `author.bestReviews`
- [ ] `bookReview.changes.bestReviewAuthors.hasChanged` works correctly
- [ ] `BookReviewCodegen.ts` is auto-generated with `hasReactiveCollectionOtherSide()`
- [ ] `BookReviewOpts` does NOT include `bestReviewAuthors` field
- [ ] All existing tests continue to pass
